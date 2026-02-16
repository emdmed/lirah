use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct CommitWatcherState {
    pub watchers: HashMap<PathBuf, RecommendedWatcher>,
    pub last_hashes: HashMap<PathBuf, String>,
}

impl CommitWatcherState {
    pub fn new() -> Self {
        Self {
            watchers: HashMap::new(),
            last_hashes: HashMap::new(),
        }
    }
}

pub type CommitWatcherStore = Arc<Mutex<CommitWatcherState>>;

pub fn create_commit_watcher_store() -> CommitWatcherStore {
    Arc::new(Mutex::new(CommitWatcherState::new()))
}

fn get_current_commit(repo_path: &Path) -> Option<String> {
    // Read HEAD to find current branch
    let head_path = repo_path.join(".git/HEAD");
    let head_content = std::fs::read_to_string(&head_path).ok()?;
    let trimmed = head_content.trim();

    if let Some(ref_path) = trimmed.strip_prefix("ref: ") {
        // Regular branch - read the ref file
        let ref_file = repo_path.join(".git").join(ref_path);
        std::fs::read_to_string(&ref_file)
            .ok()
            .map(|s| s.trim().to_string())
    } else {
        // Detached HEAD - the hash is directly in HEAD
        Some(trimmed.to_string())
    }
}

fn get_current_branch(repo_path: &Path) -> Option<String> {
    let head_path = repo_path.join(".git/HEAD");
    let head_content = std::fs::read_to_string(&head_path).ok()?;
    let trimmed = head_content.trim();
    trimmed
        .strip_prefix("ref: refs/heads/")
        .map(|s| s.to_string())
}

pub fn start_watcher(
    repo_path: PathBuf,
    app: AppHandle,
    store: CommitWatcherStore,
) -> Result<(), String> {
    let git_dir = repo_path.join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    // Store initial commit hash
    if let Some(hash) = get_current_commit(&repo_path) {
        store
            .lock()
            .map_err(|e| e.to_string())?
            .last_hashes
            .insert(repo_path.clone(), hash);
    }

    let refs_dir = git_dir.join("refs").join("heads");
    if !refs_dir.exists() {
        std::fs::create_dir_all(&refs_dir).map_err(|e| e.to_string())?;
    }

    let repo_path_clone = repo_path.clone();
    let store_clone = store.clone();
    let last_event = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(10)));

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

    let mut watcher =
        RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;

    // Watch refs/heads for branch ref changes
    watcher
        .watch(&refs_dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Also watch HEAD for branch switches
    watcher
        .watch(&git_dir.join("HEAD"), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    eprintln!("[commit-watcher] Started watching {:?}", refs_dir);

    // Spawn debounce thread
    let app_clone = app.clone();
    std::thread::spawn(move || {
        for event in rx {
            if let Ok(event) = event {
                eprintln!("[commit-watcher] fs event: {:?}", event.kind);
                match event.kind {
                    EventKind::Modify(_) | EventKind::Create(_) => {}
                    _ => continue,
                }

                // Debounce: skip if last event was < 2s ago
                let mut last = last_event.lock().unwrap();
                let now = Instant::now();
                if now.duration_since(*last) < Duration::from_secs(2) {
                    continue;
                }
                *last = now;
                drop(last);

                // Wait a moment for git to finish writing
                std::thread::sleep(Duration::from_millis(500));

                // Check if commit actually changed
                if let Some(new_hash) = get_current_commit(&repo_path_clone) {
                    let mut st = store_clone.lock().unwrap();
                    let changed = st
                        .last_hashes
                        .get(&repo_path_clone)
                        .map(|old| old != &new_hash)
                        .unwrap_or(true);

                    if changed {
                        eprintln!("[commit-watcher] New commit detected: {}", new_hash);
                        st.last_hashes
                            .insert(repo_path_clone.clone(), new_hash.clone());
                        drop(st);

                        let branch =
                            get_current_branch(&repo_path_clone).unwrap_or_default();

                        eprintln!("[commit-watcher] Emitting commit-detected for branch={}", branch);
                        let _ = app_clone.emit(
                            "commit-detected",
                            serde_json::json!({
                                "branch": branch,
                                "commit_hash": new_hash,
                                "repo_path": repo_path_clone.to_string_lossy(),
                            }),
                        );
                    }
                }
            }
        }
    });

    store
        .lock()
        .map_err(|e| e.to_string())?
        .watchers
        .insert(repo_path, watcher);

    Ok(())
}

pub fn stop_watcher(repo_path: &Path, store: &CommitWatcherStore) -> Result<(), String> {
    let mut st = store.lock().map_err(|e| e.to_string())?;
    st.watchers.remove(repo_path);
    st.last_hashes.remove(repo_path);
    Ok(())
}
