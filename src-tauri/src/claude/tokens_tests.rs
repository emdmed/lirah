use super::*;

// procStart on Windows is a FILETIME (100 ns ticks since 1601-01-01), as in a
// real ~/.claude/sessions/<pid>.json: "134388254014261688".
const REAL_PROC_START: &str = "134388254014261688";
const REAL_UNIX_SECS: u64 = 1_794_351_801;

#[test]
fn filetime_converts_to_unix_ms() {
    assert_eq!(filetime_to_unix_ms(134_388_254_014_261_688), Some(1_794_351_801_426));
    assert_eq!(filetime_to_unix_ms(116_444_736_000_000_000), Some(0)); // the unix epoch
    assert_eq!(filetime_to_unix_ms(116_444_736_000_000_000 - 1), None); // before it
}

#[test]
fn proc_start_matches_the_process_start_time() {
    assert!(filetime_matches_start(REAL_PROC_START, REAL_UNIX_SECS));
    assert!(filetime_matches_start(REAL_PROC_START, REAL_UNIX_SECS + 1)); // clock rounding
    assert!(filetime_matches_start(REAL_PROC_START, REAL_UNIX_SECS - 1));
}

#[test]
fn proc_start_of_a_reused_pid_is_rejected() {
    // Same pid, but the process started a minute later: the registry entry is stale.
    assert!(!filetime_matches_start(REAL_PROC_START, REAL_UNIX_SECS + 60));
    assert!(!filetime_matches_start(REAL_PROC_START, REAL_UNIX_SECS - 60));
}

#[test]
fn unparseable_proc_start_is_rejected() {
    assert!(!filetime_matches_start("", REAL_UNIX_SECS));
    assert!(!filetime_matches_start("abc", REAL_UNIX_SECS));
    assert!(!filetime_matches_start("12345", REAL_UNIX_SECS)); // a /proc tick count, not a FILETIME
}

#[test]
fn session_cwd_is_compared_in_canonical_form() {
    assert!(same_cwd("/home/u/p", "/home/u/p/"));
    assert!(!same_cwd("/home/u/p", "/home/u/q"));
    #[cfg(windows)]
    {
        assert!(same_cwd(r"C:\a", "c:/a"));
        assert!(same_cwd(r"\\?\C:\a\b", r"C:\a\b\"));
        assert!(same_cwd(r"c:\a/b", "C:/a/b"));
        assert!(!same_cwd(r"C:\a", r"C:\b"));
    }
}
