use super::*;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// A shell that runs a long-lived grandchild, so the tree is root -> shell -> sleeper.
fn spawn_tree() -> Child {
    #[cfg(windows)]
    let mut c = {
        let mut c = Command::new("cmd");
        c.args(["/C", "ping -n 30 127.0.0.1 >nul"]);
        c
    };
    #[cfg(not(windows))]
    let mut c = {
        let mut c = Command::new("sh");
        c.args(["-c", "sleep 30; true"]);
        c
    };
    c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap()
}

#[test]
fn descendant_pids_finds_the_children_of_a_process_tree() {
    let mut root = spawn_tree();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut found = Vec::new();
    while Instant::now() < deadline && found.is_empty() {
        std::thread::sleep(Duration::from_millis(200));
        found = descendant_pids(root.id());
    }
    let _ = root.kill();
    let _ = root.wait();
    assert!(!found.is_empty(), "no descendants found for pid {}", root.id());
    assert!(!found.contains(&root.id()), "the root is not its own descendant");
}

#[test]
fn descendant_pids_of_a_missing_process_is_empty() {
    assert!(descendant_pids(u32::MAX - 1).is_empty());
}
