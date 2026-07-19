pub mod commands;

use std::collections::HashMap;
use std::sync::Mutex;

/// Tracks running background agent jobs so they can be cancelled.
/// Maps job_id -> process-group id (== the spawned shell's pid, since each
/// job is spawned in its own process group).
pub struct AgentJobStore {
    pub jobs: Mutex<HashMap<String, u32>>,
}

impl AgentJobStore {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
        }
    }
}

pub fn create_agent_job_store() -> std::sync::Arc<AgentJobStore> {
    std::sync::Arc::new(AgentJobStore::new())
}
