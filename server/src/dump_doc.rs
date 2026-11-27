use std::path::Path;

use anyhow::{bail, Context, Result};
use time::OffsetDateTime;

use crate::liststore::{self, ListStore};

pub fn dump_doc(path: &str) -> Result<()> {
    let path = Path::new(path);
    let Some(lists_dir) = path.parent() else {
        bail!("doc path has no parent");
    };
    let Some(list_id) = path.file_name() else {
        bail!("doc path has no name");
    };

    let store = liststore::FSStore::new(&lists_dir.to_string_lossy());
    let Some(doc) = store
        .load(&list_id.to_string_lossy())
        .context("error loading document")?
    else {
        bail!("doc not found");
    };

    println!("Current value:");
    println!(
        "{}",
        serde_json::to_string(&automerge::AutoSerde::from(&doc))
            .context("error serializing to JSON")?
    );

    println!("Heads:");
    println!("{:?}", doc.get_heads());

    println!("Changes:");

    let empty_message = "<no message>".to_owned();

    for change in doc.get_changes(&[]).context("error getting changes")? {
        let date = OffsetDateTime::from_unix_timestamp(change.timestamp())
            .context("error parsing timestamp")?;
        println!(
            "{} {} {}",
            change.hash(),
            date,
            change.message().unwrap_or(&empty_message)
        );
    }

    Ok(())
}
