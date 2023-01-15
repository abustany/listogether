use std::{collections::HashMap, sync::Arc, future::Future};

pub struct MultiLock {
    locks: std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

impl MultiLock {
    pub fn new() -> Self {
        MultiLock { locks: std::sync::Mutex::new(HashMap::new()) }
    }

    pub async fn with_lock<A, B>(&self, key: &str, f: impl FnOnce() -> A) -> B
    where A: Future<Output=B>
    {
        loop {
            let maybe_doc_lock = {
                let locks = self.locks.lock().unwrap();
                locks.get(key).map(Arc::clone)
            };

            // if the doc is already locked, wait for the lock to be released.
            if let Some(lock) = maybe_doc_lock {
                _ = lock.lock().await;
            }

            let mutex = Arc::new(tokio::sync::Mutex::new(()));
            let guard = mutex.clone().lock_owned();

            {
                let mut locks = self.locks.lock().unwrap();
                if locks.contains_key(key) { continue } // we've been raced, try again
                locks.insert(key.to_owned(), Arc::clone(&mutex));
            };

            let res = f().await;

            drop(guard); // release the mutex

            {
                let mut locks = self.locks.lock().unwrap();
                locks.remove(key);
            }

            return res;
        }
    }
}
