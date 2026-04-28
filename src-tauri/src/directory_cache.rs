use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::fs::directory::{DirectoryEntry, RecursiveDirectoryEntry};

// Cache entry with TTL
#[derive(Clone, Debug)]
struct CacheEntry<T> {
    entries: Arc<Vec<T>>,
    cached_at: Instant,
}

// Cache configuration
const CACHE_TTL_SECONDS: u64 = 2;

// Directory listing cache - uses RwLock for better read performance
pub struct DirectoryCache {
    entries: Arc<RwLock<HashMap<PathBuf, CacheEntry<DirectoryEntry>>>>,
    recursive_entries: Arc<RwLock<HashMap<PathBuf, CacheEntry<RecursiveDirectoryEntry>>>>,
}

impl DirectoryCache {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            recursive_entries: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get directory listing from cache if valid
    pub fn get(&self, path: &PathBuf) -> Option<Arc<Vec<DirectoryEntry>>> {
        let entries = self.entries.read().ok()?;
        let entry = entries.get(path)?;

        if entry.cached_at.elapsed() > Duration::from_secs(CACHE_TTL_SECONDS) {
            return None;
        }

        Some(entry.entries.clone())
    }

    /// Store directory listing in cache
    pub fn set(&self, path: PathBuf, entries: Vec<DirectoryEntry>) {
        if let Ok(mut cache) = self.entries.write() {
            cache.insert(
                path,
                CacheEntry {
                    entries: Arc::new(entries),
                    cached_at: Instant::now(),
                },
            );
        }
    }

    /// Get recursive directory listing from cache if valid
    pub fn get_recursive(&self, path: &PathBuf) -> Option<Arc<Vec<RecursiveDirectoryEntry>>> {
        let entries = self.recursive_entries.read().ok()?;
        let entry = entries.get(path)?;

        if entry.cached_at.elapsed() > Duration::from_secs(CACHE_TTL_SECONDS) {
            return None;
        }

        Some(entry.entries.clone())
    }

    /// Store recursive directory listing in cache
    pub fn set_recursive(&self, path: PathBuf, entries: Vec<RecursiveDirectoryEntry>) {
        if let Ok(mut cache) = self.recursive_entries.write() {
            cache.insert(
                path,
                CacheEntry {
                    entries: Arc::new(entries),
                    cached_at: Instant::now(),
                },
            );
        }
    }

    /// Invalidate a specific directory entry (both flat and recursive)
    pub fn invalidate(&self, path: &PathBuf) {
        if let Ok(mut cache) = self.entries.write() {
            cache.remove(path);
        }
        if let Ok(mut cache) = self.recursive_entries.write() {
            cache.remove(path);
        }
    }

    /// Clear all cached entries
    pub fn clear(&self) {
        if let Ok(mut cache) = self.entries.write() {
            cache.clear();
        }
        if let Ok(mut cache) = self.recursive_entries.write() {
            cache.clear();
        }
    }
}
