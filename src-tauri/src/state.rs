use portable_pty::{Child, MasterPty};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send>,
    pub writer: Box<dyn Write + Send>,
    pub shutdown: Arc<AtomicBool>,
    pub sandboxed: bool,
}

pub struct AppStateData {
    pub pty_sessions: HashMap<String, PtySession>,
    pub git_cache: crate::git_cache::GitStatsCache,
    pub directory_cache: crate::directory_cache::DirectoryCache,
}

pub type AppState = Arc<Mutex<AppStateData>>;

pub fn create_state() -> AppState {
    Arc::new(Mutex::new(AppStateData {
        pty_sessions: HashMap::new(),
        git_cache: crate::git_cache::GitStatsCache::new(),
        directory_cache: crate::directory_cache::DirectoryCache::new(),
    }))
}
