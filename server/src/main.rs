use std::{net::SocketAddr, sync::Arc};

use anyhow::{anyhow, Context, Result};
use automerge::{Automerge, ActorId};
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Router,
};
use clap::{Parser, Subcommand};
use log::info;

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
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

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
                .route("/device/register", post(device_register_handler))
                .with_state(app_state)
                .route("/document/:id/sync", post(sync_handler));

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

async fn sync_handler(Path(doc_id): Path<String>, body: Bytes) -> std::result::Result<String, (StatusCode, String)> {
    let message = automerge::sync::Message::decode(&body).context("error decoding message").map_err(|e| (StatusCode::BAD_REQUEST, format!("{:?}", e)))?;
    let actor_id = ActorId::from(&SERVER_ACTOR_ID);
    let mut doc = Automerge::new().with_actor(actor_id);
    let mut sync_state = automerge::sync::State::new();

    doc.receive_sync_message(&mut sync_state, message).context("error receiving message").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{:?}", e)))?;

    Ok(format!("Synchronizing {}", &doc_id))
}
