use std::io::ErrorKind;
use std::path::PathBuf;

use anyhow::{Context, Result};
use automerge::Automerge;

pub trait ListStore {
    fn load(&self, id: &str) -> Result<Option<Automerge>>;
    fn save(&self, id: &str, doc: &mut Automerge) -> Result<()>;
}

pub struct FSStore {
    base_dir: String,
}

impl FSStore {
    pub fn new(base_dir: &str) -> Self {
        FSStore {
            base_dir: base_dir.to_owned(),
        }
    }

    fn list_path(&self, id: &str) -> PathBuf {
        [&self.base_dir, id].iter().collect()
    }
}

impl ListStore for FSStore {
    fn load(&self, id: &str) -> Result<Option<Automerge>> {
        let data = match std::fs::read(self.list_path(id)) {
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(e).context("error opening file");
            }
            Ok(f) => f,
        };

        Automerge::load(&data)
            .map(Some)
            .context("error parsing data")
    }

    fn save(&self, id: &str, doc: &mut Automerge) -> Result<()> {
        std::fs::write(self.list_path(id), doc.save())?;
        Ok(())
    }
}
