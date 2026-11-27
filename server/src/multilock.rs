use std::{collections::HashMap, sync::Arc};

use tokio::sync::{Mutex, OwnedMutexGuard};

#[derive(Default)]
pub struct MultiLock {
    locks: std::sync::Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

pub struct MultiLockGuard<'a> {
    owner: &'a MultiLock,
    key: String,
    guard: Option<OwnedMutexGuard<()>>,
}

impl MultiLock {
    pub async fn lock(&self, key: &str) -> MultiLockGuard<'_> {
        let mutex = Arc::clone(
            self.locks
                .lock()
                .unwrap()
                .entry(key.to_owned())
                .or_default(),
        );
        MultiLockGuard {
            owner: self,
            key: key.to_owned(),
            guard: Some(mutex.lock_owned().await),
        }
    }
}

impl Drop for MultiLockGuard<'_> {
    fn drop(&mut self) {
        let mut locks = self.owner.locks.lock().unwrap();
        drop(self.guard.take());
        // Each task waiting for this key holds a reference, so the map holds the last one only when nobody waits.
        if locks
            .get(&self.key)
            .is_some_and(|m| Arc::strong_count(m) == 1)
        {
            locks.remove(&self.key);
        }
    }
}

#[cfg(test)]
mod test {
    use std::{sync::Arc, time::Duration};

    use tokio::time::timeout;

    use super::MultiLock;

    const SHORT: Duration = Duration::from_millis(50);
    const LONG: Duration = Duration::from_secs(5);

    fn is_empty(lock: &MultiLock) -> bool {
        lock.locks.lock().unwrap().is_empty()
    }

    #[tokio::test]
    async fn test_same_key_waits() {
        let lock = MultiLock::default();
        let guard = lock.lock("a").await;

        assert!(timeout(SHORT, lock.lock("a")).await.is_err());

        drop(guard);
        let guard = timeout(LONG, lock.lock("a"))
            .await
            .expect("lock not released");
        drop(guard);
        assert!(is_empty(&lock));
    }

    #[tokio::test]
    async fn test_other_key_does_not_wait() {
        let lock = MultiLock::default();
        let _a = lock.lock("a").await;
        let _b = timeout(LONG, lock.lock("b"))
            .await
            .expect("other key is blocked");
    }

    #[tokio::test]
    async fn test_waiter_gets_lock_after_release() {
        let lock = Arc::new(MultiLock::default());
        let guard = lock.lock("a").await;

        let waiter = tokio::spawn({
            let lock = Arc::clone(&lock);
            async move {
                let _guard = lock.lock("a").await;
            }
        });

        tokio::time::sleep(SHORT).await;
        assert!(!waiter.is_finished());
        // The waiter still needs the entry, so releasing the lock must not remove it.
        drop(guard);
        assert!(!is_empty(&lock));

        timeout(LONG, waiter)
            .await
            .expect("waiter did not get the lock")
            .unwrap();
        assert!(is_empty(&lock));
    }

    #[tokio::test]
    async fn test_cancelled_waiter_does_not_keep_entry() {
        let lock = MultiLock::default();
        let guard = lock.lock("a").await;

        assert!(timeout(SHORT, lock.lock("a")).await.is_err());

        drop(guard);
        assert!(is_empty(&lock));
    }

    #[tokio::test]
    async fn test_panic_releases_lock() {
        let lock = Arc::new(MultiLock::default());

        let res = tokio::spawn({
            let lock = Arc::clone(&lock);
            async move {
                let _guard = lock.lock("a").await;
                panic!("panic while holding the lock");
            }
        })
        .await;
        assert!(res.is_err());

        let _guard = timeout(LONG, lock.lock("a"))
            .await
            .expect("lock not released after panic");
    }
}
