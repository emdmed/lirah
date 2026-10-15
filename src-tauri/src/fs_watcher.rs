use notify::event::ModifyKind;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::fs::directory::{dir_key, DirKey};
use crate::fs::{read_current_branch, resolve_git_dir};
use crate::ignore_dirs::{should_ignore_file, IGNORE_DIRS};
use crate::state::AppState;
use crate::watch_registry::{drain_debounced, Acquired, WatchRegistry};

/// One created or deleted path in an "fs-changes" event.
#[derive(Serialize, Clone, Debug)]
pub struct FsChange {
    pub path: String,
    /// For a deleted path: whether it was a directory the watcher knew about.
    pub is_dir: bool,
}

/// Payload emitted with "fs-changes" events so the frontend can do incremental updates.
#[derive(Serialize, Clone, Debug, Default)]
pub struct FsChangesPayload {
    pub created: Vec<FsChange>,
    pub deleted: Vec<FsChange>,
    /// The path exactly as passed to `start_fs_watcher`.
    pub root_path: String,
}

/// Payload of "branch-changed", emitted when .git/HEAD now names another branch.
#[derive(Serialize, Clone, Debug)]
struct BranchChangedPayload {
    /// The path exactly as passed to `start_fs_watcher`.
    path: String,
    /// The checked-out branch, or None for a detached HEAD.
    branch: Option<String>,
}

struct WatcherHandle {
    // Kept alive — dropping signals the watcher thread to stop
    _stop_tx: mpsc::Sender<()>,
}

/// Active filesystem watchers, one per project path, shared by every tab that
/// shows that project (ref-counted: start adds a user, stop removes one).
pub struct FsWatcherStore {
    registry: WatchRegistry<PathBuf, WatcherHandle>,
}

impl FsWatcherStore {
    pub fn new() -> Self {
        Self {
            registry: WatchRegistry::new(),
        }
    }
}

/// Git state files that indicate index/HEAD changes worth notifying about.
const GIT_STATE_FILES: &[&str] = &[
    "index", "HEAD", "ORIG_HEAD", "MERGE_HEAD",
    "CHERRY_PICK_HEAD", "REBASE_HEAD", "COMMIT_EDITMSG",
];

/// Quiet period that ends a batch of events.
const DEBOUNCE_QUIET: Duration = Duration::from_millis(1000);
/// Longest a batch may grow before it is emitted anyway.
const DEBOUNCE_MAX_WAIT: Duration = Duration::from_millis(3000);

/// Per-event info sent from the notify callback to the debounce thread.
#[derive(Debug)]
enum FsEvent {
    /// Created, removed or renamed; whether it now exists is checked at emit time.
    Touched(PathBuf),
    /// A file's content was written.
    ContentModified,
    /// A git state file changed; `head` when it was HEAD itself.
    GitChanged { head: bool },
}

fn in_ignored_dir(path: &Path, ignore_set: &HashSet<&str>) -> bool {
    path.components().any(|c| match c {
        Component::Normal(name) => name.to_str().is_some_and(|s| ignore_set.contains(s)),
        _ => false,
    })
}

/// The directories being watched, by path and by identity. The identity set
/// keeps a symlink loop (or two links to one target) from being walked twice.
#[derive(Default)]
struct WatchedDirs {
    by_path: HashMap<PathBuf, DirKey>,
    visited: HashSet<DirKey>,
}

impl WatchedDirs {
    /// Watch `root` and every non-ignored directory below it, one non-recursive
    /// watch each, so .git, node_modules, target, etc. never get inotify watches.
    fn watch_tree(
        &mut self,
        watcher: &mut RecommendedWatcher,
        root: &Path,
        ignore_set: &HashSet<&str>,
    ) -> Result<(), String> {
        if !self.add(watcher, root)? {
            return Ok(());
        }
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                // Follows symlinks: workspaces are made of symlinked projects.
                if !path.is_dir() {
                    continue;
                }
                let ignored = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| ignore_set.contains(n));
                if ignored {
                    continue;
                }
                if self.add(watcher, &path).unwrap_or(false) {
                    stack.push(path);
                }
            }
        }
        Ok(())
    }

    /// Watch one directory. Ok(false) if it is already watched under any path.
    fn add(&mut self, watcher: &mut RecommendedWatcher, dir: &Path) -> Result<bool, String> {
        let Some(key) = dir_key(dir) else { return Ok(false) };
        // DirKey is Copy on unix but a PathBuf elsewhere.
        #[allow(clippy::clone_on_copy)]
        if !self.visited.insert(key.clone()) {
            return Ok(false);
        }
        if let Err(e) = watcher.watch(dir, RecursiveMode::NonRecursive) {
            self.visited.remove(&key);
            return Err(format!("Failed to watch {}: {}", dir.display(), e));
        }
        self.by_path.insert(dir.to_path_buf(), key);
        Ok(true)
    }

    /// Forget a deleted path and everything watched below it. Returns whether
    /// it was a watched directory. (inotify drops the watches by itself.)
    fn remove(&mut self, path: &Path) -> bool {
        let was_dir = self.by_path.contains_key(path);
        if was_dir {
            let visited = &mut self.visited;
            self.by_path.retain(|p, key| {
                let gone = p.starts_with(path);
                if gone {
                    visited.remove(key);
                }
                !gone
            });
        }
        was_dir
    }
}

fn build_fs_watcher(
    path: String,
    app_handle: AppHandle,
    app_state: AppState,
) -> Result<WatcherHandle, String> {
    let watch_path = PathBuf::from(&path);
    if !watch_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    // get_git_stats caches under the canonical path, so invalidate with that.
    let canonical_path = watch_path
        .canonicalize()
        .unwrap_or_else(|_| watch_path.clone());

    let ignore_set: HashSet<&'static str> = IGNORE_DIRS.iter().copied().collect();
    let ignore_set_for_callback = ignore_set.clone();

    // `.git` may be a file pointing elsewhere (linked worktree, submodule).
    let git_dir = resolve_git_dir(&watch_path);
    let git_dir_for_callback = git_dir.clone();
    let root_for_callback = watch_path.clone();

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (event_tx, event_rx) = mpsc::channel::<FsEvent>();

    // Create the notify watcher — filter events in the callback and tag them
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(event) = res else { return };

        if let Some(git_dir) = &git_dir_for_callback {
            let git_file = event.paths.iter().find_map(|p| {
                let name = p.file_name()?.to_str()?;
                (p.starts_with(git_dir) && GIT_STATE_FILES.contains(&name)).then_some(name)
            });
            if let Some(name) = git_file {
                let _ = event_tx.send(FsEvent::GitChanged { head: name == "HEAD" });
                return;
            }
        }

        let touched = match event.kind {
            EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) => true,
            EventKind::Modify(ModifyKind::Data(_)) | EventKind::Modify(ModifyKind::Any) => false,
            _ => return,
        };

        for p in &event.paths {
            // Filter out temp/editor files and ignored directories
            // Only components below the root count: a project may itself live
            // under a directory named like an ignored one (~/build/app).
            let relative = p.strip_prefix(&root_for_callback).unwrap_or(p);
            if should_ignore_file(p) || in_ignored_dir(relative, &ignore_set_for_callback) {
                continue;
            }
            let _ = event_tx.send(if touched {
                FsEvent::Touched(p.clone())
            } else {
                FsEvent::ContentModified
            });
        }
    }).map_err(|e| format!("Failed to create watcher: {}", e))?;

    let mut dirs = WatchedDirs::default();
    dirs.watch_tree(&mut watcher, &watch_path, &ignore_set)?;

    // Also watch the git directory for index/HEAD changes (unified watcher)
    if let Some(git_dir) = &git_dir {
        let _ = watcher.watch(git_dir, RecursiveMode::NonRecursive);
    }

    // Debounce thread: owns the watcher, collects events, emits after a quiet
    // period (or the max wait).
    thread::spawn(move || {
        let mut last_branch = read_current_branch(&watch_path);

        loop {
            // Wait for either a stop signal or a FS event
            match stop_rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => break,
                Err(mpsc::TryRecvError::Empty) => {}
            }

            let first_event = match event_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(ev) => ev,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            };

            let mut touched: BTreeSet<PathBuf> = BTreeSet::new();
            let mut removed_dirs: HashSet<PathBuf> = HashSet::new();
            let mut content_modified = false;
            let mut git_changed = false;
            let mut head_changed = false;
            let mut handle = |ev: FsEvent| match ev {
                FsEvent::Touched(p) => {
                    if p.is_dir() {
                        // Watch a new directory right away, so files created
                        // in it during this batch are seen too.
                        let _ = dirs.watch_tree(&mut watcher, &p, &ignore_set);
                    } else if dirs.remove(&p) {
                        // Forget a vanished directory now, so the same inode
                        // reappearing under a new name (a rename) gets watched.
                        removed_dirs.insert(p.clone());
                    }
                    touched.insert(p);
                }
                FsEvent::ContentModified => content_modified = true,
                FsEvent::GitChanged { head } => {
                    git_changed = true;
                    head_changed |= head;
                }
            };
            handle(first_event);
            drain_debounced(&event_rx, Instant::now(), DEBOUNCE_QUIET, DEBOUNCE_MAX_WAIT, &mut handle);

            // Whether a path was created or deleted is decided by what is on
            // disk now, so a file created and removed within one batch is
            // reported once, as deleted.
            let mut payload = FsChangesPayload {
                root_path: path.clone(),
                ..Default::default()
            };
            for p in touched {
                let path_str = p.to_string_lossy().to_string();
                if p.symlink_metadata().is_ok() {
                    payload.created.push(FsChange { path: path_str, is_dir: p.is_dir() });
                } else {
                    let is_dir = removed_dirs.contains(&p) || dirs.remove(&p);
                    payload.deleted.push(FsChange { path: path_str, is_dir });
                }
            }
            let has_fs_changes = !payload.created.is_empty() || !payload.deleted.is_empty();

            // Invalidate directory cache and emit fs-changes if there were file changes
            if has_fs_changes {
                if let Ok(state_lock) = app_state.lock() {
                    state_lock.directory_cache.invalidate(&watch_path);
                }
                let _ = app_handle.emit("fs-changes", &payload);
            }

            // Git index/HEAD changes, content writes and created/deleted files
            // all move the per-file stats.
            if git_changed || content_modified || has_fs_changes {
                if let Ok(state_lock) = app_state.lock() {
                    state_lock.git_cache.invalidate(&canonical_path);
                }
                let _ = app_handle.emit("git-stats-changed", &path);
            }

            if head_changed {
                let branch = read_current_branch(&watch_path);
                if branch != last_branch {
                    last_branch = branch.clone();
                    let _ = app_handle.emit(
                        "branch-changed",
                        BranchChangedPayload { path: path.clone(), branch },
                    );
                }
            }
        }
    });

    Ok(WatcherHandle { _stop_tx: stop_tx })
}

/// Start watching a directory for file create/delete/modify events.
/// Emits "fs-changes", "git-stats-changed" and "branch-changed" (debounced).
/// Ref-counted per path: pair every call with `stop_fs_watcher`.
#[tauri::command]
pub async fn start_fs_watcher(
    path: String,
    app_handle: AppHandle,
    store: tauri::State<'_, Arc<FsWatcherStore>>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let store = store.inner().clone();
    let app_state = state.inner().clone();
    let key = PathBuf::from(&path);

    let Acquired::New(generation) = store.registry.acquire(&key) else {
        return Ok(());
    };
    let built = crate::ipc::blocking("start_fs_watcher", move || {
        build_fs_watcher(path, app_handle, app_state)
    })
    .await;
    match built {
        Ok(handle) => {
            store.registry.attach(&key, generation, handle);
            Ok(())
        }
        Err(e) => {
            store.registry.abandon(&key, generation);
            Err(e)
        }
    }
}

/// Release one user of the watcher for a path; it stops with the last user.
/// If no path is given, stops all watchers (backwards compat).
#[tauri::command]
pub fn stop_fs_watcher(
    path: Option<String>,
    store: tauri::State<Arc<FsWatcherStore>>,
) -> Result<(), String> {
    match path {
        Some(p) => store.registry.release(&PathBuf::from(p)),
        None => store.registry.clear(),
    }
    Ok(())
}
