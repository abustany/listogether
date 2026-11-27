use std::{net::SocketAddr, path::PathBuf};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tracing_subscriber::filter::{EnvFilter, LevelFilter};

mod device_id;
mod dump_doc;
mod liststore;
mod multilock;
mod serve;

#[derive(Parser)]
#[command(author, version, about = "Listogether sync server", long_about = None)]
#[command(propagate_version = true)]
struct Args {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Outputs a new ID signing key to stdout
    GenerateSigningKey,

    /// Starts the server
    Serve {
        /// Address on which to listen
        #[arg(long, default_value = "127.0.0.1:8789", env = "LISTEN_ADDRESS")]
        listen_address: SocketAddr,

        /// Key used to sign device IDs (so they can't be forged)
        // Parsed by hand: clap prints the invalid value in its error message, and this is a secret.
        #[arg(long, env = "ID_SIGNING_KEY")]
        id_signing_key: String,

        /// Base directory where lists are stored
        #[arg(long)]
        lists_dir: PathBuf,
    },

    /// Dump a document as JSON
    DumpDocument {
        #[arg(long)]
        path: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive(LevelFilter::INFO.into())
                .add_directive("tower_http=trace".parse()?),
        )
        .init();

    match Args::parse().command {
        Commands::GenerateSigningKey => {
            println!("{}", device_id::SigningKey::generate().to_base64());
            Ok(())
        }
        Commands::Serve {
            listen_address,
            id_signing_key,
            lists_dir,
        } => {
            let id_signing_key = id_signing_key
                .parse()
                .context("error parsing ID signing key")?;
            serve::serve(listen_address, lists_dir, id_signing_key).await
        }
        Commands::DumpDocument { path } => dump_doc::dump_doc(&path),
    }
}
