use std::{net::SocketAddr, sync::Arc};

use anyhow::{anyhow, Context, Result, bail};
use automerge::{Automerge, ActorId};
use axum::{
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    routing::{get, post},
    Router, response::Response,
};
use clap::{Parser, Subcommand};
use multilock::MultiLock;
use serde::Serialize;
use tracing::{error, info};
use tracing_subscriber;

mod device_id;
use device_id::DeviceID;

mod liststore;
mod multilock;

#[derive(Parser)]
#[clap(author, version, about = "Listogether sync server", long_about = None)]
#[clap(propagate_version = true)]
struct Args {
    #[clap(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Outputs a new ID signing key to stdout
    GenerateSigningKey,

    /// Starts the server
    Serve {
        /// Address on which to listen
        #[arg(long, default_value = "127.0.0.1:8789")]
        listen_address: String,

        /// Key used to sign device IDs (so they can't be forged)
        #[arg(long, env = "ID_SIGNING_KEY")]
        id_signing_key: String,

        /// Base directory where lists are stored
        #[arg(long)]
        lists_dir: String,
    },
}

struct AppState {
    id_signing_key: device_id::SigningKey,
    list_store: Box<dyn liststore::ListStore + Send + Sync>,
    doc_locks: MultiLock,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing::subscriber::set_global_default(
        tracing_subscriber::FmtSubscriber::builder()
            .with_env_filter(
                tracing_subscriber::filter::EnvFilter::from_default_env()
                    .add_directive(tracing_subscriber::filter::LevelFilter::INFO.into())
                    .add_directive("tower_http=trace".parse()?)
            )
            .finish()
    ).expect("setting default subscriber failed");

    let args = Args::parse();

    match args.command {
        Commands::GenerateSigningKey => {
            println!("{}", device_id::SigningKey::generate().to_string());
            Ok(())
        }
        Commands::Serve {
            listen_address,
            id_signing_key,
            lists_dir,
        } => {
            let listen_address: SocketAddr = listen_address
                .parse()
                .context("error parsing listen address")?;
            let id_signing_key = device_id::SigningKey::from_string(&id_signing_key)
                .context("error parsing ID signing key")?;

            let app_state = Arc::new(AppState{
                id_signing_key,
                list_store: Box::new(liststore::FSStore::new(&lists_dir)),
                doc_locks: MultiLock::new(),
            });

            let app = Router::new()
                .route("/health", get(healthcheck_handler))
                .route("/api/v1/device/register", post(device_register_handler))
                .route("/api/v1/document/sync", get(sync_handler))
                .with_state(app_state)
                .layer(tower_http::trace::TraceLayer::new_for_http()
                    .on_request(())
                    .on_response(
                        tower_http::trace::DefaultOnResponse::new()
                            .level(tracing::Level::INFO)
                            .latency_unit(tower_http::LatencyUnit::Micros)
                    )
                );

            info!("Starting server on {}", &listen_address);

            axum::Server::bind(&listen_address)
                .serve(app.into_make_service())
                .await
                .map_err(|err| anyhow!(err))?;

            Ok(())
        }
    }
}

async fn healthcheck_handler() -> &'static str {
    "OK"
}

#[derive(Serialize)]
struct DeviceRegisterResult {
    id: String,
    raw: String, 
}

async fn device_register_handler(State(state): State<Arc<AppState>>) -> String {
    let id = DeviceID::new(&state.id_signing_key);
    serde_json::to_string(&DeviceRegisterResult{
        id: id.to_string(),
        raw: DeviceID::encode(id.raw()),
    }).unwrap()
}

const SERVER_ACTOR_ID: [u8; 1] = [0];

async fn sync_handler(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(|socket| sync_socket_handler(state, socket))
}

async fn receive_binary_message(socket: &mut WebSocket) -> Result<Option<Vec<u8>>> {
    let msg = match socket.recv().await {
        Some(Ok(msg)) => msg,
        Some(Err(e)) => { return Err(e.into()); },
        None => { return Ok(None); }
    };

    match msg {
        Message::Binary(x) => Ok(Some(x)),
        Message::Close(_) => Ok(None),
        _ => {
            // ignore error here, this is a message sent just before closing the connection
            _ = socket.send(r#"{"error": "invalid message type"}"#.into()).await;
            bail!("received invalid message type {:?}", msg);
        },
    }
}

async fn sync_doc_locked(state: Arc<AppState>, socket: &mut WebSocket, doc_id: &str, expected_author_id: &ActorId) -> Result<Automerge> {
    let actor_id = ActorId::from(&SERVER_ACTOR_ID);
    let mut doc = {
        let state = Arc::clone(&state);
        let doc_id = doc_id.to_owned();
        tokio::task::spawn_blocking(move || {
            state.list_store.load(&doc_id)
        }).await.context("panic while opening doc")?.context("error opening document")?
    }.unwrap_or_else(|| Automerge::new()).with_actor(actor_id);
    let mut sync_state = automerge::sync::State::new();

    loop {
        let payload = match receive_binary_message(socket).await {
            Err(e) => { return Err(e); },
            Ok(None) => { bail!("socket closed before sync was done"); }, // socket closed before receiving proto version
            Ok(Some(data)) => data,
        };

        info!("received sync message ({} bytes)", payload.len());

        if payload.len() > 0 {
            let message = automerge::sync::Message::decode(&payload).context("error decoding sync message")?;

            for change in &message.changes {
                if change.actor_id() != expected_author_id {
                    bail!("unexpected actor ID {} in change {}, expected {}", change.actor_id(), change.hash(), expected_author_id);
                }
            }

            if let Err(_) = doc.receive_sync_message(&mut sync_state, message) {
                bail!("error applying sync message");
            }
        }

        let reply = if let Some(message) = doc.generate_sync_message(&mut sync_state) {
            let res = message.encode();
            info!("sending sync reply ({} bytes)", res.len());
            res
        } else {
            info!("no more sync messages to send");
            vec!()
        };

        let done = reply.len() == 0;

        socket.send(reply.into()).await.context("error sending sync message")?;

        if done {
            info!("we're done");
            break;
        }
    }

    {
        let state = Arc::clone(&state);
        let doc_id = doc_id.to_owned();
        let mut doc = doc.clone();

        tokio::task::spawn_blocking(move || {
            state.list_store.save(&doc_id, &mut doc)
        }).await.context("panic saving doc")?.context("error saving doc")?;
    }

    Ok(doc)
}

async fn sync_doc(state: Arc<AppState>, socket: &mut WebSocket, expected_author_id: &ActorId) -> Result<Option<Automerge>> {
    let doc_id = match receive_binary_message(socket).await.context("error receiving doc id")? {
        None => { return Ok(None); },
        Some(data) => String::from_utf8_lossy(&data).into_owned(),
    };

    info!("synchronizing document {}", &doc_id);

    let doc = state.doc_locks.with_lock(&doc_id, || {
        sync_doc_locked(Arc::clone(&state), socket, &doc_id, expected_author_id)
    }).await;

    Ok(Some(doc?))
}

async fn receive_protocol_and_device_id(state: &AppState, socket: &mut WebSocket) -> Result<Option<device_id::DeviceID>> {
    match receive_binary_message(socket).await.context("error receiving proto version")? {
        None => { return Ok(None); }, // socket closed before receiving proto version
        Some(data) => {
            if data.len() != 1 || data[0] != 1 {
                bail!("received invalid proto version (len: {})", data.len());
            }
        },
    };

    let device_id_str = match receive_binary_message(socket).await.context("error receiving device ID")? {
        None => { return Ok(None); }, // socket closed before receiving device ID
        Some(data) => {
            String::from_utf8_lossy(&data).into_owned()
        },
    };

    let device_id = DeviceID::from_string(&state.id_signing_key, &device_id_str).context("error parsing device ID")?;

    info!("remote device ID is {}", device_id.to_string());

    Ok(Some(device_id))
}

async fn sync_socket_handler(state: Arc<AppState>, mut socket: WebSocket) {
    let device_id = match receive_protocol_and_device_id(&state, &mut socket).await {
        Err(e) => {
            error!("error initializing sync: {:#}", e);
            return;
        },
        Ok(None) => { return; },
        Ok(Some(id)) => id,
    };

    let expected_actor_id = ActorId::from(device_id.raw());

    loop {
        match sync_doc(Arc::clone(&state), &mut socket, &expected_actor_id).await {
            Err(e) => {
                error!("sync failed: {}", e);
                return;
            },
            Ok(None) => {
                info!("no more documents to sync");
                return;
            },
            Ok(Some(doc)) => {
                info!("sync done, result: {:?}", doc);
            },
        };


    }
}
