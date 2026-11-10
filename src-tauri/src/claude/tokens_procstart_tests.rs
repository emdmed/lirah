use super::*;

const REAL_PROC_START: &str = "134388254014261688";
const REAL_UNIX_SECS: u64 = 1_794_351_801;

// A procStart in a format we cannot read is no proof against the session:
// the check is skipped, like a missing cwd.
#[test]
fn proc_start_that_is_not_a_filetime_is_skipped() {
    assert!(proc_start_ok(None, REAL_UNIX_SECS));
    assert!(proc_start_ok(Some("abc"), REAL_UNIX_SECS));
    assert!(proc_start_ok(Some(""), REAL_UNIX_SECS));
    assert!(proc_start_ok(Some("0x1f2e"), REAL_UNIX_SECS));
}

#[test]
fn proc_start_that_is_a_filetime_must_match() {
    assert!(proc_start_ok(Some(REAL_PROC_START), REAL_UNIX_SECS));
    assert!(proc_start_ok(Some(REAL_PROC_START), REAL_UNIX_SECS + 1));
    assert!(!proc_start_ok(Some(REAL_PROC_START), REAL_UNIX_SECS + 60));
}
