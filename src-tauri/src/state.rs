use crate::pty::session::SessionHandle;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct WorkspaceContext {
    pub workspace_path: String,
    pub path_map: HashMap<String, String>,
}

pub struct AppStateData {
    /// Each session sits behind its own `Arc`: clone it out and drop this lock
    /// right away — never hold the global lock across PTY work.
    pub pty_sessions: HashMap<String, Arc<SessionHandle>>,
    pub git_cache: crate::git_cache::GitStatsCache,
    pub directory_cache: crate::directory_cache::DirectoryCache,
    pub workspace_context: Option<WorkspaceContext>,
}

pub type AppState = Arc<Mutex<AppStateData>>;

pub fn create_state() -> AppState {
    Arc::new(Mutex::new(AppStateData {
        pty_sessions: HashMap::new(),
        git_cache: crate::git_cache::GitStatsCache::new(),
        directory_cache: crate::directory_cache::DirectoryCache::new(),
        workspace_context: None,
    }))
}
