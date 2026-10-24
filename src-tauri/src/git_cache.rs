use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, RwLock};
use std::time::{Duration, Instant};
use std::path::{Path, PathBuf};

pub type Stats = Arc<HashMap<String, crate::fs::GitStats>>;

/// One git stats computation in progress. Callers that miss the cache while
/// it runs wait for it and share its result instead of running git again.
pub struct Flight {
    /// Cache generation of the repo when the computation started.
    generation: u64,
    result: Mutex<Option<Result<Stats, String>>>,
    done: Condvar,
}

impl Flight {
    fn new(generation: u64) -> Self {
        Self {
            generation,
            result: Mutex::new(None),
            done: Condvar::new(),
        }
    }

    /// Block until the leader finishes, then return its result.
    pub fn wait(&self) -> Result<Stats, String> {
        let mut result = self.result.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if let Some(r) = result.as_ref() {
                return r.clone();
            }
            result = self.done.wait(result).unwrap_or_else(|e| e.into_inner());
        }
    }

    fn finish(&self, value: Result<Stats, String>) {
        let mut result = self.result.lock().unwrap_or_else(|e| e.into_inner());
        if result.is_none() {
            *result = Some(value);
        }
        self.done.notify_all();
    }
}

/// What a caller should do after missing or hitting the cache.
pub enum Lookup {
    /// Fresh cached stats.
    Hit(Stats),
    /// Someone else is computing them: wait on the flight.
    Join(Arc<Flight>),
    /// The caller computes them, then calls `GitStatsCache::complete`.
    Lead(Arc<Flight>),
}

// Cache entry with TTL - now uses Arc to avoid cloning the entire HashMap
#[derive(Clone, Debug)]
struct CacheEntry {
    stats: Arc<HashMap<String, crate::fs::GitStats>>,
    cached_at: Instant,
}

// Cache configuration. While file watchers are on, the fs watcher invalidates
// an entry on any index/HEAD change or content write, so the TTL only bounds
// staleness for changes it cannot see. With watchers off nothing invalidates,
// so entries expire almost immediately.
const CACHE_TTL_SECONDS: u64 = 15;
const UNWATCHED_CACHE_TTL_SECONDS: u64 = 1;
const CLEANUP_INTERVAL_SECONDS: u64 = 60;

// Main cache structure - uses RwLock for better read performance
// Watchers are handled by the unified fs_watcher module.
pub struct GitStatsCache {
    entries: Arc<RwLock<HashMap<PathBuf, CacheEntry>>>,
    enabled: Arc<RwLock<bool>>,
    last_cleanup: Arc<RwLock<Option<Instant>>>,
    /// Bumped on every invalidation, so a computation that started before a
    /// change is neither joined nor cached after it.
    generations: Arc<RwLock<HashMap<PathBuf, u64>>>,
    in_flight: Arc<Mutex<HashMap<PathBuf, Arc<Flight>>>>,
}

impl GitStatsCache {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            enabled: Arc::new(RwLock::new(true)),
            last_cleanup: Arc::new(RwLock::new(None)),
            generations: Arc::new(RwLock::new(HashMap::new())),
            in_flight: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn generation(&self, repo_path: &Path) -> u64 {
        self.generations
            .read()
            .ok()
            .and_then(|g| g.get(repo_path).copied())
            .unwrap_or(0)
    }

    /// Cached stats, or the computation to join, or a new one to lead.
    /// Single-flight per repo path and generation.
    pub fn lookup(&self, repo_path: &Path) -> Lookup {
        if let Some(stats) = self.get(repo_path) {
            return Lookup::Hit(stats);
        }
        let generation = self.generation(repo_path);
        let mut in_flight = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(flight) = in_flight.get(repo_path) {
            if flight.generation == generation {
                return Lookup::Join(flight.clone());
            }
        }
        let flight = Arc::new(Flight::new(generation));
        in_flight.insert(repo_path.to_path_buf(), flight.clone());
        Lookup::Lead(flight)
    }

    /// Finish a flight from `lookup`: cache a successful result unless the repo
    /// was invalidated meanwhile, and wake everyone waiting on it.
    pub fn complete(&self, repo_path: &Path, flight: &Arc<Flight>, result: Result<Stats, String>) {
        if let Ok(stats) = &result {
            if self.generation(repo_path) == flight.generation {
                self.set(repo_path.to_path_buf(), stats.clone());
            }
        }
        {
            let mut in_flight = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
            if in_flight.get(repo_path).is_some_and(|f| Arc::ptr_eq(f, flight)) {
                in_flight.remove(repo_path);
            }
        }
        flight.finish(result);
    }

    // Get stats from cache or return None if expired/missing
    // Returns Arc to avoid cloning the entire HashMap
    pub fn get(&self, repo_path: &Path) -> Option<Arc<HashMap<String, crate::fs::GitStats>>> {
        let entries = self.entries.read().ok()?;
        let entry = entries.get(repo_path)?;

        // Check TTL
        if entry.cached_at.elapsed() > self.ttl() {
            return None;
        }

        Some(entry.stats.clone()) // Clones the Arc, not the HashMap
    }

    // Store stats in cache and periodically cleanup expired entries
    pub fn set(&self, repo_path: PathBuf, stats: Arc<HashMap<String, crate::fs::GitStats>>) {
        if let Ok(mut entries) = self.entries.write() {
            entries.insert(repo_path, CacheEntry {
                stats,
                cached_at: Instant::now(),
            });
        }

        // Periodic cleanup of expired entries
        self.maybe_cleanup();
    }

    fn ttl(&self) -> Duration {
        Duration::from_secs(if self.is_enabled() {
            CACHE_TTL_SECONDS
        } else {
            UNWATCHED_CACHE_TTL_SECONDS
        })
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
                let ttl = self.ttl();
                entries.retain(|_, entry| entry.cached_at.elapsed() <= ttl);
            }
        }
    }

    // Invalidate specific repository
    pub fn invalidate(&self, repo_path: &Path) {
        if let Ok(mut generations) = self.generations.write() {
            *generations.entry(repo_path.to_path_buf()).or_insert(0) += 1;
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_misses_share_one_flight() {
        let cache = GitStatsCache::new();
        let path = Path::new("/repo");
        let Lookup::Lead(lead) = cache.lookup(path) else { panic!("expected lead") };
        let Lookup::Join(join) = cache.lookup(path) else { panic!("expected join") };
        assert!(Arc::ptr_eq(&lead, &join));
        cache.complete(path, &lead, Ok(Arc::new(HashMap::new())));
        assert!(join.wait().is_ok());
        assert!(matches!(cache.lookup(path), Lookup::Hit(_)));
    }

    #[test]
    fn invalidation_starts_a_new_flight_and_skips_caching() {
        let cache = GitStatsCache::new();
        let path = Path::new("/repo");
        let Lookup::Lead(old) = cache.lookup(path) else { panic!("expected lead") };
        cache.invalidate(path);
        let Lookup::Lead(new) = cache.lookup(path) else { panic!("expected new lead") };
        cache.complete(path, &old, Ok(Arc::new(HashMap::new())));
        assert!(matches!(cache.lookup(path), Lookup::Join(_)));
        cache.complete(path, &new, Ok(Arc::new(HashMap::new())));
        assert!(matches!(cache.lookup(path), Lookup::Hit(_)));
    }
}
