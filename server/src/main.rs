use std::{net::SocketAddr, sync::Arc};

use anyhow::{anyhow, Context, Result, bail};
use automerge::{Automerge, ActorId};
use axum::{
    extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}},
    routing::{get, post},
    Router, response::Response,
};
use clap::{Parser, Subcommand};
use tracing::{error, info};
use tracing_subscriber;

mod device_id;

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
    },
}

struct AppState {
    id_signing_key: device_id::SigningKey,
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
        } => {
            let listen_address: SocketAddr = listen_address
                .parse()
                .context("error parsing listen address")?;
            let id_signing_key = device_id::SigningKey::from_string(&id_signing_key)
                .context("error parsing ID signing key")?;

            let app_state = Arc::new(AppState { id_signing_key });

            let app = Router::new()
                .route("/health", get(healthcheck_handler))
                .route("/api/v1/device/register", post(device_register_handler))
                .with_state(app_state)
                .route("/api/v1/document/sync", get(sync_handler))
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

async fn device_register_handler(State(state): State<Arc<AppState>>) -> String {
    device_id::DeviceID::new(&state.id_signing_key).to_string()
}

const SERVER_ACTOR_ID: [u8; 1] = [0];

async fn sync_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(sync_socket_handler)
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

async fn sync_doc(socket: &mut WebSocket) -> Result<Automerge> {
    let actor_id = ActorId::from(&SERVER_ACTOR_ID);
    let mut doc = Automerge::new().with_actor(actor_id);
    let mut sync_state = automerge::sync::State::new();

    loop {
        let payload = match receive_binary_message(socket).await {
            Err(e) => { return Err(e); },
            Ok(None) => { bail!("socket closed before sync was done"); }, // socket closed before receiving proto version
            Ok(Some(data)) => data,
        };

        info!("received sync message ({} bytes)", payload.len());

        if payload.len() > 0 {
            let message = match automerge::sync::Message::decode(&payload) {
                Err(_) => { bail!("error decoding sync message"); }
                Ok(msg) => msg,
            };

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

        let done = payload.len() == 0 && reply.len() == 0;

        if let Err(e) = socket.send(reply.into()).await {
            bail!("error sending sync message: {:?}", e);
        }

        if done {
            info!("peer is done and we're done");
            return Ok(doc);
        }
    }
}

async fn sync_socket_handler(mut socket: WebSocket) {
    match receive_binary_message(&mut socket).await {
        Err(e) => {
            error!("error receiving proto version: {:#}", e);
            return;
        },
        Ok(None) => { return; }, // socket closed before receiving proto version
        Ok(Some(data)) => {
            if data.len() != 1 || data[0] != 1 {
                error!("received invalid proto version (len: {})", data.len());
                return;
            }
        },
    };

    loop {
        let doc_id = match receive_binary_message(&mut socket).await {
            Err(e) => {
                error!("error receiving doc id: {:#}", e);
                return;
            },
            Ok(None) => {
                info!("no more documents to sync");
                return;
            },
            Ok(Some(data)) => {
                String::from_utf8_lossy(&data).into_owned()
            },
        };

        info!("starting sync for document {}", doc_id);

        match sync_doc(&mut socket).await {
            Ok(doc) => {
                info!("sync done, result: {:?}", doc);
            },
            Err(e) => {
                error!("sync failed: {}", e);
            },
        }
    }
}
