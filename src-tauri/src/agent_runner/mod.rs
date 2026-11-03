pub mod commands;

use process_wrap::std::ChildWrapper;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// A running job and every process it started (process group on Unix, Job
/// Object on Windows).
pub type JobChild = Arc<Mutex<Box<dyn ChildWrapper>>>;

/// Tracks running background agent jobs so they can be cancelled.
pub struct AgentJobStore {
    pub jobs: Mutex<HashMap<String, JobChild>>,
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
