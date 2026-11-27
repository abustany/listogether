use std::path::Path;

use anyhow::{bail, Context, Result};
use time::OffsetDateTime;

use crate::liststore::{self, ListStore};

pub fn dump_doc(path: &Path) -> Result<()> {
    let Some(lists_dir) = path.parent() else {
        bail!("doc path has no parent");
    };
    let Some(list_id) = path.file_name().and_then(|name| name.to_str()) else {
        bail!("doc path has no name, or the name is not valid UTF-8");
    };

    let store = liststore::FSStore::new(lists_dir);
    let Some(doc) = store.load(list_id).context("error loading document")? else {
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

    for change in doc.get_changes(&[]).context("error getting changes")? {
        let date = OffsetDateTime::from_unix_timestamp(change.timestamp())
            .context("error parsing timestamp")?;
        println!(
            "{} {} {}",
            change.hash(),
            date,
            change.message().map_or("<no message>", String::as_str)
        );
    }

    Ok(())
}
