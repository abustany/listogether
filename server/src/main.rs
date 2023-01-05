use std::{net::SocketAddr, sync::Arc};

use anyhow::{anyhow, Context, Result};
use automerge::{Automerge, ActorId};
use axum::{
    extract::{Path, State, WebSocketUpgrade, ws::{WebSocket, Message}},
    routing::{get, post},
    Router, response::Response,
};
use clap::{Parser, Subcommand};
use tracing::info;
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
                .route("/api/v1/document/:id/sync", get(sync_handler))
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

async fn sync_handler(Path(doc_id): Path<String>, ws: WebSocketUpgrade) -> Response {

    ws.on_upgrade(|socket| sync_socket_handler(doc_id, socket))
}

async fn sync_socket_handler(doc_id: String, mut socket: WebSocket) {
    let actor_id = ActorId::from(&SERVER_ACTOR_ID);
    let mut doc = Automerge::new().with_actor(actor_id);
    let mut sync_state = automerge::sync::State::new();

    while let Some(msg) = socket.recv().await {
        let msg = if let Ok(msg) = msg {
            msg
        } else {
            // client disconnected
            return;
        };

        let payload = match msg {
            Message::Binary(x) => x,
            _ => {
                // ignore error here, this is a message sent just before closing the connection
                _ = socket.send(r#"{"error": "invalid message type"}"#.into()).await;
                return;
            },
        };

        let message = match automerge::sync::Message::decode(&payload) {
            Err(_) => {
                _ = socket.send(r#"{"error": "error decoding sync message"}"#.into()).await;
                return;
            }
            Ok(msg) => msg,
        };

        if let Err(_) = doc.receive_sync_message(&mut sync_state, message) {
            _ = socket.send(r#"{"error": "error receiving sync message"}"#.into()).await;
            return;
        }
    }
}
