use super::*;
use crate::paths::to_app;
use std::process::Command;

fn git(dir: &Path, args: &[&str]) {
    let ok = Command::new("git")
        .args(["-c", "user.name=t", "-c", "user.email=t@t"])
        .args(args)
        .current_dir(dir)
        .status()
        .unwrap()
        .success();
    assert!(ok, "git {args:?}");
}

/// Git stats keys are sent to the frontend: they must be in the app's path form
/// (no backslashes, no `\\?\`), the same as the file tree's paths.
#[test]
fn git_stats_keys_use_the_app_path_form() {
    let repo = std::env::temp_dir().join(format!("lirah-git-keys-{}", std::process::id()));
    let _ = fs::remove_dir_all(&repo);
    fs::create_dir_all(repo.join("src")).unwrap();
    git(&repo, &["init", "-q"]);
    fs::write(repo.join("src").join("a.txt"), "one\n").unwrap();
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    fs::write(repo.join("src").join("a.txt"), "one\ntwo\n").unwrap(); // tracked change
    fs::create_dir_all(repo.join("new")).unwrap();
    fs::write(repo.join("new").join("b.txt"), "x\n").unwrap(); // untracked

    let stats = get_git_diff_stats(&repo).unwrap();
    let mut keys: Vec<&String> = stats.keys().collect();
    keys.sort();
    let mut want = vec![
        to_app(&repo.join("src").join("a.txt")),
        to_app(&repo.join("new").join("b.txt")),
    ];
    want.sort();
    let _ = fs::remove_dir_all(&repo);

    assert_eq!(keys, want.iter().collect::<Vec<_>>());
    for k in keys {
        assert!(!k.contains('\\') || !cfg!(windows), "backslash in key {k}");
        assert!(!k.starts_with("//?/") && !k.starts_with(r"\\?\"), "verbatim prefix in key {k}");
    }
}
