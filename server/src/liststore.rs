use std::io::ErrorKind;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use automerge::Automerge;
use uuid::{Uuid, Variant, Version};

use crate::device_id::RAW_DEVICE_ID_LEN;

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

    fn list_path(&self, id: &str) -> Result<PathBuf> {
        if !is_valid_doc_id(id) {
            bail!("invalid document ID");
        }
        Ok([&self.base_dir, id].iter().collect())
    }
}

impl ListStore for FSStore {
    fn load(&self, id: &str) -> Result<Option<Automerge>> {
        let data = match std::fs::read(self.list_path(id)?) {
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
        std::fs::write(self.list_path(id)?, doc.save())?;
        Ok(())
    }
}

// IDs come from clients and become file names. Only the lowercase forms are accepted, so that one
// document always maps to one file.
fn is_valid_doc_id(id: &str) -> bool {
    is_list_id(id) || is_list_ids_doc_id(id)
}

fn is_list_id(id: &str) -> bool {
    Uuid::try_parse(id).is_ok_and(|uuid| {
        uuid.get_version() == Some(Version::Random)
            && uuid.get_variant() == Variant::RFC4122
            && uuid.hyphenated().to_string() == id
    })
}

// Each device stores the IDs of its lists in a document named after its raw device ID, in hex.
fn is_list_ids_doc_id(id: &str) -> bool {
    id.len() == 2 * RAW_DEVICE_ID_LEN && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

#[cfg(test)]
mod test {
    use super::is_valid_doc_id;

    const LIST_ID: &str = "0b6f1c2e-6c1a-4f0e-9a4e-3f5b2d8c7e1a";

    #[test]
    fn test_valid_doc_ids() {
        assert!(is_valid_doc_id(LIST_ID));
        assert!(is_valid_doc_id("ffffffff-ffff-4fff-bfff-ffffffffffff"));
        assert!(is_valid_doc_id("e1b75c93df58d7a61a9c08d048c5f978"));
    }

    #[test]
    fn test_invalid_doc_ids() {
        assert!(!is_valid_doc_id(""));
        assert!(!is_valid_doc_id(".."));
        assert!(!is_valid_doc_id("../0b6f1c2e-6c1a-4f0e-9a4e-3f5b2d8c7e1a"));
        assert!(!is_valid_doc_id("/etc/passwd"));
        assert!(!is_valid_doc_id("0B6F1C2E-6C1A-4F0E-9A4E-3F5B2D8C7E1A"));
        assert!(!is_valid_doc_id("{0b6f1c2e-6c1a-4f0e-9a4e-3f5b2d8c7e1a}"));
        assert!(!is_valid_doc_id(
            "urn:uuid:0b6f1c2e-6c1a-4f0e-9a4e-3f5b2d8c7e1a"
        ));
        // version 1
        assert!(!is_valid_doc_id("0b6f1c2e-6c1a-1f0e-9a4e-3f5b2d8c7e1a"));
        // variant is not RFC 4122
        assert!(!is_valid_doc_id("0b6f1c2e-6c1a-4f0e-ca4e-3f5b2d8c7e1a"));
        // a UUID without hyphens is not a list ID, but it has the form of a list IDs document ID
        assert!(is_valid_doc_id("0b6f1c2e6c1a4f0e9a4e3f5b2d8c7e1a"));
        assert!(!is_valid_doc_id("E1B75C93DF58D7A61A9C08D048C5F978"));
        assert!(!is_valid_doc_id("e1b75c93df58d7a61a9c08d048c5f97"));
        assert!(!is_valid_doc_id("e1b75c93df58d7a61a9c08d048c5f9780"));
        assert!(!is_valid_doc_id("g1b75c93df58d7a61a9c08d048c5f978"));
    }
}
