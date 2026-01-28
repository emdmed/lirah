use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use notify::{Watcher, RecursiveMode, Event};
use notify::event::{EventKind, ModifyKind, CreateKind, RemoveKind};

// Cache entry with TTL - now uses Arc to avoid cloning the entire HashMap
#[derive(Clone, Debug)]
struct CacheEntry {
    stats: Arc<HashMap<String, crate::fs::GitStats>>,
    cached_at: Instant,
}

// Cache configuration
const CACHE_TTL_SECONDS: u64 = 5;
const CLEANUP_INTERVAL_SECONDS: u64 = 60;

// Main cache structure - uses RwLock for better read performance
#[derive(Default)]
pub struct GitStatsCache {
    entries: Arc<RwLock<HashMap<PathBuf, CacheEntry>>>,
    watcher_stops: Arc<RwLock<HashMap<PathBuf, Sender<()>>>>,
    enabled: Arc<RwLock<bool>>,
    last_cleanup: Arc<RwLock<Option<Instant>>>,
}

impl GitStatsCache {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            watcher_stops: Arc::new(RwLock::new(HashMap::new())),
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
    #[allow(dead_code)]
    pub fn invalidate(&self, repo_path: &Path) {
        if let Ok(mut entries) = self.entries.write() {
            entries.remove(repo_path);
        }
    }

    // Setup filesystem watcher for a repository
    pub fn setup_watcher(&self, repo_path: PathBuf) -> Result<(), String> {
        // Check if watchers are enabled
        let enabled = self.enabled.read().ok().map(|e| *e).unwrap_or(false);
        if !enabled {
            return Ok(());
        }

        let git_dir = repo_path.join(".git");
        if !git_dir.exists() {
            return Err("Not a git repository".to_string());
        }

        // Acquire write lock to atomically check and insert (fixes race condition)
        let mut stops = self.watcher_stops.write()
            .map_err(|_| "Failed to acquire lock")?;

        if stops.contains_key(&repo_path) {
            return Ok(());
        }

        // Create channel for stop signal
        let (stop_tx, stop_rx) = channel::<()>();

        // Insert before spawning to prevent race condition
        stops.insert(repo_path.clone(), stop_tx);
        drop(stops); // Release lock before spawning thread

        // Clone Arc for watcher callback
        let entries = self.entries.clone();
        let watcher_stops = self.watcher_stops.clone();
        let repo_path_for_thread = repo_path.clone();
        let git_dir_clone = git_dir.clone();

        // Spawn watcher thread
        std::thread::spawn(move || {
            // Clone for the inner closure (moved into watcher callback)
            let entries_for_callback = entries.clone();
            let repo_path_for_callback = repo_path_for_thread.clone();

            // Create watcher
            let mut watcher = match notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        // Check for relevant git events (index, HEAD, or refs changes)
                        let should_invalidate = matches!(
                            event.kind,
                            EventKind::Modify(ModifyKind::Data(_))
                            | EventKind::Modify(ModifyKind::Any)
                            | EventKind::Create(CreateKind::File)
                            | EventKind::Create(CreateKind::Any)
                            | EventKind::Remove(RemoveKind::File)
                            | EventKind::Remove(RemoveKind::Any)
                        ) && event.paths.iter().any(|p| {
                            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            // Watch for common git state files
                            matches!(name, "index" | "HEAD" | "ORIG_HEAD" | "MERGE_HEAD"
                                | "CHERRY_PICK_HEAD" | "REBASE_HEAD" | "COMMIT_EDITMSG")
                        });

                        if should_invalidate {
                            if let Ok(mut entries) = entries_for_callback.write() {
                                entries.remove(&repo_path_for_callback);
                            }
                        }
                    }
                    Err(e) => eprintln!("Watch error: {:?}", e),
                }
            }) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("Failed to create watcher: {}", e);
                    // Clean up the stop sender since watcher failed
                    if let Ok(mut stops) = watcher_stops.write() {
                        stops.remove(&repo_path_for_thread);
                    }
                    return;
                }
            };

            // Watch .git directory
            if let Err(e) = watcher.watch(&git_dir_clone, RecursiveMode::NonRecursive) {
                eprintln!("Failed to watch git directory: {}", e);
                if let Ok(mut stops) = watcher_stops.write() {
                    stops.remove(&repo_path_for_thread);
                }
                return;
            }

            // Keep watcher alive until stop signal
            loop {
                match stop_rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(_) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        // Stop signal received or sender dropped
                        drop(watcher);
                        break;
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Continue watching
                    }
                }
            }
        });

        Ok(())
    }

    // Stop watcher for a specific repository
    #[allow(dead_code)]
    pub fn stop_watcher(&self, repo_path: &Path) {
        if let Ok(mut stops) = self.watcher_stops.write() {
            stops.remove(repo_path);
            // Dropping the sender signals the thread to stop
        }
    }

    // Stop all watchers
    pub fn stop_all_watchers(&self) {
        if let Ok(mut stops) = self.watcher_stops.write() {
            stops.clear();
            // Dropping all senders signals all threads to stop
        }
    }

    // Enable watchers
    pub fn enable_watchers(&self) {
        if let Ok(mut enabled) = self.enabled.write() {
            *enabled = true;
        }
    }

    // Disable watchers and stop all active watchers
    pub fn disable_watchers(&self) {
        if let Ok(mut enabled) = self.enabled.write() {
            *enabled = false;
        }
        self.stop_all_watchers();
    }

    // Check if watchers are enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled.read().ok().map(|e| *e).unwrap_or(false)
    }

    // Get cache statistics for debugging
    #[allow(dead_code)]
    pub fn stats(&self) -> (usize, usize) {
        let entries_count = self.entries.read().ok().map(|e| e.len()).unwrap_or(0);
        let watchers_count = self.watcher_stops.read().ok().map(|w| w.len()).unwrap_or(0);
        (entries_count, watchers_count)
    }
}
