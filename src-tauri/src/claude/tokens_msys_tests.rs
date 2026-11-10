use super::*;

// The agent runs in Git Bash on Windows, so a registry cwd can be msys-style.
#[cfg(windows)]
#[test]
fn same_cwd_accepts_an_msys_style_cwd() {
    assert!(same_cwd("/c/Users/x", "C:/Users/x"));
    assert!(same_cwd("/c/Users/x/", r"C:\Users\x"));
    assert!(same_cwd("/C/Users/x", r"c:\users\x"));
    assert!(!same_cwd("/c/Users/x", "C:/Users/y"));
    assert!(!same_cwd("/d/Users/x", "C:/Users/x"));
}

// Not Windows-only: a unix cwd must not be mistaken for an msys drive.
#[test]
fn same_cwd_still_distinguishes_plain_unix_folders() {
    assert!(same_cwd("/home/u/p", "/home/u/p/"));
    assert!(!same_cwd("/c/x", "/d/x") || cfg!(windows));
}
