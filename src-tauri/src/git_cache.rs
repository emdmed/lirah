use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use std::path::{Path, PathBuf};

// Cache entry with TTL - now uses Arc to avoid cloning the entire HashMap
#[derive(Clone, Debug)]
struct CacheEntry {
    stats: Arc<HashMap<String, crate::fs::GitStats>>,
    cached_at: Instant,
}

// Cache configuration
const CACHE_TTL_SECONDS: u64 = 1;
const CLEANUP_INTERVAL_SECONDS: u64 = 60;

// Main cache structure - uses RwLock for better read performance
// Watchers are handled by the unified fs_watcher module.
pub struct GitStatsCache {
    entries: Arc<RwLock<HashMap<PathBuf, CacheEntry>>>,
    enabled: Arc<RwLock<bool>>,
    last_cleanup: Arc<RwLock<Option<Instant>>>,
}

impl GitStatsCache {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            enabled: Arc::new(RwLock::new(true)),
            last_cleanup: Arc::new(RwLock::new(None)),
        }
    }

    // Get stats from cache or return None if expired/missing
    // Returns Arc to avoid cloning the entire HashMap
    pub fn get(&self, repo_path: &Path) -> Option<Arc<HashMap<String, crate::fs::GitStats>>> {
        let entries = self.entries.read().ok()?;
        let entry = entries.get(repo_path)?;

        // Check TTL
        if entry.cached_at.elapsed() > Duration::from_secs(CACHE_TTL_SECONDS) {
            return None;
        }

        Some(entry.stats.clone()) // Clones the Arc, not the HashMap
    }

    // Store stats in cache and periodically cleanup expired entries
    pub fn set(&self, repo_path: PathBuf, stats: HashMap<String, crate::fs::GitStats>) {
        if let Ok(mut entries) = self.entries.write() {
            entries.insert(repo_path, CacheEntry {
                stats: Arc::new(stats),
                cached_at: Instant::now(),
            });
        }

        // Periodic cleanup of expired entries
        self.maybe_cleanup();
    }

    // Remove expired entries to prevent memory accumulation
    fn maybe_cleanup(&self) {
        let should_cleanup = {
            let last = self.last_cleanup.read().ok();
            match last.as_ref().and_then(|l| l.as_ref()) {
                Some(instant) => instant.elapsed() > Duration::from_secs(CLEANUP_INTERVAL_SECONDS),
                None => true,
            }
        };

        if should_cleanup {
            if let Ok(mut last) = self.last_cleanup.write() {
                *last = Some(Instant::now());
            }

            if let Ok(mut entries) = self.entries.write() {
                let ttl = Duration::from_secs(CACHE_TTL_SECONDS);
                entries.retain(|_, entry| entry.cached_at.elapsed() <= ttl);
            }
        }
    }

    // Invalidate specific repository
    pub fn invalidate(&self, repo_path: &Path) {
        if let Ok(mut entries) = self.entries.write() {
            entries.remove(repo_path);
        }
    }

    // Enable watchers (flag read by get_git_stats to decide whether to cache)
    pub fn enable_watchers(&self) {
        if let Ok(mut enabled) = self.enabled.write() {
            *enabled = true;
        }
    }

    // Disable watchers
    pub fn disable_watchers(&self) {
        if let Ok(mut enabled) = self.enabled.write() {
            *enabled = false;
        }
    }

    // Check if watchers are enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled.read().ok().map(|e| *e).unwrap_or(false)
    }
}
