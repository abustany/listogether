use std::{net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use anyhow::{bail, Context, Result};
use automerge::{sync::SyncDoc, ActorId, Automerge};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::Serialize;
use tracing::{error, info};

use crate::{device_id, liststore, multilock};

#[derive(RustEmbed)]
#[folder = "../ui/dist"]
struct Assets;

struct AppState {
    id_signing_key: device_id::SigningKey,
    list_store: Box<dyn liststore::ListStore>,
    doc_locks: multilock::MultiLock,
}

pub async fn serve(
    listen_address: SocketAddr,
    lists_dir: PathBuf,
    id_signing_key: device_id::SigningKey,
) -> Result<()> {
    let app_state = Arc::new(AppState {
        id_signing_key,
        list_store: Box::new(liststore::FSStore::new(lists_dir)),
        doc_locks: multilock::MultiLock::default(),
    });

    let app = Router::new()
        .route("/health", get(healthcheck_handler))
        .route("/api/v1/device/register", post(device_register_handler))
        .route("/api/v1/document/sync", get(sync_handler))
        .fallback(asset_handler)
        .with_state(app_state)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .on_request(())
                .on_response(
                    tower_http::trace::DefaultOnResponse::new()
                        .level(tracing::Level::INFO)
                        .latency_unit(tower_http::LatencyUnit::Micros),
                ),
        );

    info!("Starting server on http://{}", listen_address);

    axum::Server::bind(&listen_address)
        .serve(app.into_make_service())
        .await
        .context("server error")
}

async fn healthcheck_handler() -> &'static str {
    "OK"
}

#[derive(Serialize)]
struct DeviceRegisterResult {
    id: String,
    raw: String,
}

async fn device_register_handler(State(state): State<Arc<AppState>>) -> Json<DeviceRegisterResult> {
    let id = device_id::DeviceID::new(&state.id_signing_key);
    Json(DeviceRegisterResult {
        id: id.to_string(),
        raw: device_id::DeviceID::encode(id.raw()),
    })
}

const SERVER_ACTOR_ID: [u8; 1] = [0];

async fn sync_handler(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(|socket| sync_socket_handler(state, socket))
}

// A client that stops responding must not keep a document locked.
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(10);

async fn receive_binary_message(socket: &mut WebSocket) -> Result<Option<Vec<u8>>> {
    let Some(msg) = tokio::time::timeout(RECEIVE_TIMEOUT, socket.recv())
        .await
        .context("timed out waiting for a message")?
        .transpose()?
    else {
        return Ok(None);
    };

    match msg {
        Message::Binary(x) => Ok(Some(x)),
        Message::Close(_) => Ok(None),
        _ => {
            // ignore error here, this is a message sent just before closing the connection
            _ = socket
                .send(r#"{"error": "invalid message type"}"#.into())
                .await;
            bail!("received invalid message type {:?}", msg);
        }
    }
}

async fn sync_doc_locked(
    state: &Arc<AppState>,
    socket: &mut WebSocket,
    doc_id: &str,
    expected_author_id: &ActorId,
) -> Result<Automerge> {
    let mut doc = {
        let state = Arc::clone(state);
        let doc_id = doc_id.to_owned();
        tokio::task::spawn_blocking(move || state.list_store.load(&doc_id))
            .await
            .context("panic while opening doc")?
            .context("error opening document")?
    }
    .unwrap_or_else(Automerge::new)
    .with_actor(ActorId::from(&SERVER_ACTOR_ID));
    let mut sync_state = automerge::sync::State::new();

    loop {
        let Some(payload) = receive_binary_message(socket).await? else {
            bail!("socket closed before sync was done");
        };

        info!("received sync message ({} bytes)", payload.len());

        if !payload.is_empty() {
            let message = automerge::sync::Message::decode(&payload)
                .context("error decoding sync message")?;

            for change in &message.changes {
                if change.actor_id() != expected_author_id {
                    bail!(
                        "unexpected actor ID {} in change {}, expected {}",
                        change.actor_id(),
                        change.hash(),
                        expected_author_id
                    );
                }
            }

            doc.receive_sync_message(&mut sync_state, message)
                .context("error applying sync message")?;
        }

        let reply = if let Some(message) = doc.generate_sync_message(&mut sync_state) {
            let res = message.encode();
            info!("sending sync reply ({} bytes)", res.len());
            res
        } else {
            info!("no more sync messages to send");
            vec![]
        };

        let done = reply.is_empty();

        socket
            .send(reply.into())
            .await
            .context("error sending sync message")?;

        if done {
            info!("we're done");
            break;
        }
    }

    let state = Arc::clone(state);
    let doc_id = doc_id.to_owned();
    tokio::task::spawn_blocking(move || state.list_store.save(&doc_id, &mut doc).map(|()| doc))
        .await
        .context("panic saving doc")?
        .context("error saving doc")
}

async fn sync_doc(
    state: &Arc<AppState>,
    socket: &mut WebSocket,
    expected_author_id: &ActorId,
) -> Result<Option<Automerge>> {
    let Some(data) = receive_binary_message(socket)
        .await
        .context("error receiving doc id")?
    else {
        return Ok(None);
    };
    let doc_id = String::from_utf8(data).context("doc ID is not valid UTF-8")?;

    info!("synchronizing document {}", doc_id);

    check_doc_access(&doc_id, expected_author_id)?;

    let _doc_lock = state.doc_locks.lock(&doc_id).await;
    sync_doc_locked(state, socket, &doc_id, expected_author_id)
        .await
        .map(Some)
}

// The list IDs document of a device is named after its raw device ID. That ID is not secret: it is
// the actor ID of every change the device makes, so the devices it shares lists with know it.
fn check_doc_access(doc_id: &str, device_actor_id: &ActorId) -> Result<()> {
    if liststore::is_list_ids_doc_id(doc_id) && doc_id != device_actor_id.to_hex_string() {
        bail!(
            "document {} is the list IDs document of another device",
            doc_id
        );
    }
    Ok(())
}

async fn receive_protocol_and_device_id(
    state: &AppState,
    socket: &mut WebSocket,
) -> Result<Option<device_id::DeviceID>> {
    let Some(proto_version) = receive_binary_message(socket)
        .await
        .context("error receiving proto version")?
    else {
        return Ok(None);
    };
    if proto_version != [1] {
        bail!(
            "received invalid proto version (len: {})",
            proto_version.len()
        );
    }

    let Some(data) = receive_binary_message(socket)
        .await
        .context("error receiving device ID")?
    else {
        return Ok(None);
    };
    let device_id_str = String::from_utf8(data).context("device ID is not valid UTF-8")?;

    let device_id = device_id::DeviceID::from_string(&state.id_signing_key, &device_id_str)
        .context("error parsing device ID")?;

    info!("remote device ID is {}", device_id);

    Ok(Some(device_id))
}

async fn sync_socket_handler(state: Arc<AppState>, mut socket: WebSocket) {
    let device_id = match receive_protocol_and_device_id(&state, &mut socket).await {
        Err(e) => {
            error!("error initializing sync: {:#}", e);
            return;
        }
        Ok(None) => return,
        Ok(Some(id)) => id,
    };

    let expected_actor_id = ActorId::from(device_id.raw());

    loop {
        match sync_doc(&state, &mut socket, &expected_actor_id).await {
            Err(e) => {
                error!("sync failed: {:#}", e);
                return;
            }
            Ok(None) => {
                info!("no more documents to sync");
                return;
            }
            Ok(Some(doc)) => {
                info!("sync done, new heads: {:?}", doc.get_heads());
            }
        };
    }
}

const INDEX_HTML: &str = "index.html";

async fn asset_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    if path.is_empty() || path == INDEX_HTML {
        return index_html();
    }

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None if path.contains('.') => not_found(),
        None => index_html(),
    }
}

fn index_html() -> Response {
    match Assets::get(INDEX_HTML) {
        Some(content) => ([(header::CONTENT_TYPE, "text/html")], content.data).into_response(),
        None => not_found(),
    }
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, "404").into_response()
}

#[cfg(test)]
mod test {
    use automerge::ActorId;

    use super::check_doc_access;

    #[test]
    fn test_check_doc_access() {
        let device = ActorId::from(&[0xe1u8; 16]);
        let other_device = ActorId::from(&[0x42u8; 16]);

        check_doc_access(&device.to_hex_string(), &device).unwrap();
        check_doc_access("0b6f1c2e-6c1a-4f0e-9a4e-3f5b2d8c7e1a", &device).unwrap();
        assert!(check_doc_access(&other_device.to_hex_string(), &device).is_err());
    }
}
