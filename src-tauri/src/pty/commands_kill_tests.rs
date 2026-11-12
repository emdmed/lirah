use super::*;
use std::process::{Child, Command, Stdio};
use sysinfo::{Pid, ProcessStatus, ProcessesToUpdate, System};

/// A throwaway process that lives until killed.
fn spawn_sleeper() -> Child {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("ping");
        c.args(["-t", "127.0.0.1"]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sleep");
        c.arg("30");
        c
    };
    let child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    std::thread::sleep(Duration::from_millis(100));
    child
}

/// True when the pid no longer runs. A zombie (killed, not yet reaped by its
/// parent) counts as gone: it executes nothing and cannot read the terminal.
fn pid_gone(pid: u32) -> bool {
    let mut sys = System::new();
    let p = Pid::from_u32(pid);
    sys.refresh_processes(ProcessesToUpdate::Some(&[p]), true);
    match sys.process(p) {
        None => true,
        Some(proc_) => proc_.status() == ProcessStatus::Zombie,
    }
}

/// On unix the test is the parent: reap in the background so the killed
/// sleeper does not stay a zombie (and `pid_gone` does not depend on it).
fn reap_in_background(mut child: Child) {
    std::thread::spawn(move || {
        let _ = child.wait();
    });
}

#[test]
fn kill_and_wait_returns_true_and_the_pid_is_gone_when_it_returns() {
    let child = spawn_sleeper();
    let pid = child.id();
    assert!(!pid_gone(pid), "the sleeper must be running before the kill");
    reap_in_background(child);

    let t0 = Instant::now();
    let ok = kill_and_wait(pid, Duration::from_secs(5));

    assert!(ok, "kill_and_wait must report success for a killable process");
    assert!(pid_gone(pid), "the pid must already be gone when kill_and_wait returns");
    assert!(t0.elapsed() < Duration::from_secs(5), "it returns as soon as the pid is gone, not at the timeout");
}

#[test]
fn kill_and_wait_returns_true_for_a_pid_that_does_not_exist() {
    // Already gone is the state the caller wants: the launch command can be
    // typed. (Not-found is told apart from not-running before this is called.)
    let child = spawn_sleeper();
    let pid = child.id();
    let mut child = child;
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(pid_gone(pid));

    assert!(kill_and_wait(pid, Duration::from_millis(500)));
}

#[test]
fn wait_until_gone_returns_false_when_the_process_stays_alive_past_the_timeout() {
    // Deterministic: liveness is injected, no real process race.
    let polls = std::cell::Cell::new(0);
    let ok = wait_until_gone(Duration::from_millis(30), || {
        polls.set(polls.get() + 1);
        true
    });
    assert!(!ok);
    assert!(polls.get() >= 1, "it must poll at least once");

    polls.set(0);
    assert!(!wait_until_gone(Duration::ZERO, || {
        polls.set(polls.get() + 1);
        true
    }));
    assert_eq!(polls.get(), 1, "zero timeout still polls once");
}

#[test]
fn kill_and_wait_gives_up_at_the_timeout_instead_of_waiting_forever() {
    let child = spawn_sleeper();
    let pid = child.id();
    let t0 = Instant::now();
    let _ = kill_and_wait(pid, Duration::from_millis(1));
    assert!(t0.elapsed() < Duration::from_secs(2));
    let mut child = child;
    let _ = child.kill();
    let _ = child.wait();
}
