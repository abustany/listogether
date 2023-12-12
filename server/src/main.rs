use std::net::SocketAddr;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tracing_subscriber;

mod device_id;
mod dump_doc;
mod liststore;
mod multilock;
mod serve;

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
        #[arg(long, default_value = "127.0.0.1:8789", env = "LISTEN_ADDRESS")]
        listen_address: String,

        /// Key used to sign device IDs (so they can't be forged)
        #[arg(long, env = "ID_SIGNING_KEY")]
        id_signing_key: String,

        /// Base directory where lists are stored
        #[arg(long)]
        lists_dir: String,
    },

    /// Dump a document as JSON
    DumpDocument {
        #[arg(long)]
        path: String,
    },
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

            serve::serve(&listen_address, &lists_dir, &id_signing_key).await?;

            Ok(())
        }
        Commands::DumpDocument{
            path,
        } => {
            dump_doc::dump_doc(&path)?;
            Ok(())
        }
    }
}
