use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::fs::directory::{DirectoryEntry, RecursiveListing};

// Cache entry with TTL; the value is shared, never cloned out of the cache.
#[derive(Debug)]
struct CacheEntry<T> {
    value: Arc<T>,
    cached_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(value: Arc<T>) -> Self {
        Self {
            value,
            cached_at: Instant::now(),
        }
    }

    fn fresh(&self) -> Option<Arc<T>> {
        (self.cached_at.elapsed() <= Duration::from_secs(CACHE_TTL_SECONDS))
            .then(|| self.value.clone())
    }
}

// Cache configuration
const CACHE_TTL_SECONDS: u64 = 2;

/// Recursive listings depend on the walk limits as well as the root.
type RecursiveKey = (PathBuf, usize, usize);

// Directory listing cache - uses RwLock for better read performance
pub struct DirectoryCache {
    entries: RwLock<HashMap<PathBuf, CacheEntry<Vec<DirectoryEntry>>>>,
    recursive_entries: RwLock<HashMap<RecursiveKey, CacheEntry<RecursiveListing>>>,
}

impl DirectoryCache {
    pub fn new() -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            recursive_entries: RwLock::new(HashMap::new()),
        }
    }

    /// Get directory listing from cache if valid
    pub fn get(&self, path: &Path) -> Option<Arc<Vec<DirectoryEntry>>> {
        self.entries.read().ok()?.get(path)?.fresh()
    }

    /// Store directory listing in cache
    pub fn set(&self, path: PathBuf, entries: Arc<Vec<DirectoryEntry>>) {
        if let Ok(mut cache) = self.entries.write() {
            cache.insert(path, CacheEntry::new(entries));
        }
    }

    /// Get recursive directory listing from cache if valid
    pub fn get_recursive(
        &self,
        path: &Path,
        max_depth: usize,
        max_files: usize,
    ) -> Option<Arc<RecursiveListing>> {
        let key = (path.to_path_buf(), max_depth, max_files);
        self.recursive_entries.read().ok()?.get(&key)?.fresh()
    }

    /// Store recursive directory listing in cache
    pub fn set_recursive(
        &self,
        path: PathBuf,
        max_depth: usize,
        max_files: usize,
        listing: Arc<RecursiveListing>,
    ) {
        if let Ok(mut cache) = self.recursive_entries.write() {
            cache.insert((path, max_depth, max_files), CacheEntry::new(listing));
        }
    }

    /// Invalidate every listing at or below `path` (flat and recursive).
    pub fn invalidate(&self, path: &Path) {
        if let Ok(mut cache) = self.entries.write() {
            cache.retain(|k, _| !k.starts_with(path));
        }
        if let Ok(mut cache) = self.recursive_entries.write() {
            cache.retain(|k, _| !k.0.starts_with(path));
        }
    }
}
