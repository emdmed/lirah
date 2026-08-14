//! Batch existence check for the design spec's file references.
//!
//! The verification pass asks "does each of these paths exist?" for every file
//! named by every node — easily a couple of hundred paths. Doing that as one
//! `path_exists` invoke per path means a couple of hundred sequential IPC round
//! trips, each hopping the main thread. One call answers the whole set.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Resolve `path` against `root` when it is relative, and report whether it
/// exists. Returned in the same order as the input.
///
/// A design often spans sibling repositories in one workspace, so a path the
/// extractor wrote as `OtherRepo/src/thing.tsx` is real but not under `root`.
/// When resolving against `root` fails, `root`'s parent is tried too — otherwise
/// every cross-repo reference is reported as missing and the diagram looks wrong
/// when it is right.
///
/// `async` so the filesystem work stays off the UI thread (Tauri runs sync
/// commands on the main thread).
#[tauri::command]
pub async fn paths_exist(paths: Vec<String>, root: Option<String>) -> Vec<bool> {
    let root = root.map(PathBuf::from);
    let parent = root
        .as_deref()
        .and_then(Path::parent)
        .map(Path::to_path_buf);

    paths
        .iter()
        .map(|p| {
            let path = Path::new(p);
            if path.is_absolute() {
                return path.exists();
            }
            let under = |base: &Option<PathBuf>| {
                base.as_ref().map(|b| b.join(path).exists()).unwrap_or(false)
            };
            if root.is_none() {
                return path.exists();
            }
            under(&root) || under(&parent)
        })
        .collect()
}

// ---- change classification -------------------------------------------------
//
// The diagram distinguishes parts this piece of work *added*, parts it
// *modified*, and parts it merely uses. That claim has to be grounded in
// something better than the extractor's opinion, so it is read off git: the
// branch's diff against its merge-base with the default branch, plus whatever
// is still uncommitted in the working tree.

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git").current_dir(dir).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).to_string())
}

fn git_top_level(dir: &Path) -> Option<PathBuf> {
    let top = run_git(dir, &["rev-parse", "--show-toplevel"])?;
    let top = PathBuf::from(top.trim());
    std::fs::canonicalize(&top).ok().or(Some(top))
}

/// "added" outranks "modified": a file this branch created and then edited is
/// still new to everyone reading the diagram.
fn mark(map: &mut HashMap<String, String>, path: &str, class: &str) {
    let path = path.trim().replace('\\', "/");
    if path.is_empty() {
        return;
    }
    let entry = map.entry(path).or_insert_with(|| class.to_string());
    if class == "added" {
        *entry = "added".to_string();
    }
}

/// Classify one `git status` XY code pair.
fn status_class(x: char, y: char) -> Option<&'static str> {
    if x == '?' || x == 'A' || y == 'A' {
        return Some("added");
    }
    if x == 'D' || y == 'D' {
        return None; // gone — nothing left to point at in the diagram
    }
    if [x, y].iter().any(|c| matches!(c, 'M' | 'R' | 'C' | 'T' | 'U')) {
        return Some("modified");
    }
    None
}

/// Every path this branch touched, mapped to "added" or "modified".
fn repo_changes(top: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();

    // Uncommitted work first — NUL-separated so paths with spaces survive.
    if let Some(out) = run_git(top, &["status", "--porcelain=v1", "-z", "-uall"]) {
        let mut fields = out.split('\0').filter(|f| !f.is_empty());
        while let Some(entry) = fields.next() {
            let mut chars = entry.chars();
            let (x, y) = (chars.next().unwrap_or(' '), chars.next().unwrap_or(' '));
            let path = entry.get(3..).unwrap_or("");
            // A rename/copy entry is followed by its source path.
            if x == 'R' || x == 'C' || y == 'R' || y == 'C' {
                fields.next();
            }
            if let Some(class) = status_class(x, y) {
                mark(&mut map, path, class);
            }
        }
    }

    // Then everything committed on this branch since it left the default one.
    if let Some(base) = merge_base(top) {
        if let Some(out) = run_git(top, &["diff", "--name-status", "-z", &base, "HEAD"]) {
            let mut fields = out.split('\0').filter(|f| !f.is_empty());
            while let Some(code) = fields.next() {
                let letter = code.chars().next().unwrap_or(' ');
                // Rename/copy emit <old>\0<new>; the new path is what we want.
                let path = if letter == 'R' || letter == 'C' {
                    fields.next();
                    fields.next()
                } else {
                    fields.next()
                };
                let Some(path) = path else { break };
                match letter {
                    'A' => mark(&mut map, path, "added"),
                    'D' => {}
                    _ => mark(&mut map, path, "modified"),
                }
            }
        }
    }

    map
}

/// Where this branch diverged from the default branch, if that can be worked out.
fn merge_base(top: &Path) -> Option<String> {
    let origin_head = run_git(top, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut candidates: Vec<String> = origin_head.into_iter().collect();
    for name in ["origin/main", "origin/master", "main", "master", "develop"] {
        candidates.push(name.to_string());
    }

    for candidate in candidates {
        if run_git(top, &["rev-parse", "--verify", "--quiet", &candidate]).is_none() {
            continue;
        }
        // A merge-base equal to HEAD just means we are *on* the default branch:
        // the branch diff comes out empty and only the working tree has
        // anything to say, which is the right answer there.
        if let Some(base) = run_git(top, &["merge-base", &candidate, "HEAD"]) {
            let base = base.trim().to_string();
            if !base.is_empty() {
                return Some(base);
            }
        }
    }
    None
}

/// Per-path change class, in input order: `added`, `modified`, `untouched`,
/// `missing` (not on disk) or `unknown` (not inside a git repository).
///
/// Batched for the same reason as [`paths_exist`] — and because the git work is
/// done once per repository no matter how many paths point into it.
#[tauri::command]
pub async fn paths_change_status(paths: Vec<String>, root: Option<String>) -> Vec<String> {
    let root = root.map(PathBuf::from);
    let parent = root
        .as_deref()
        .and_then(Path::parent)
        .map(Path::to_path_buf);

    let mut tops: HashMap<PathBuf, Option<PathBuf>> = HashMap::new();
    let mut changes: HashMap<PathBuf, HashMap<String, String>> = HashMap::new();
    let mut out = Vec::with_capacity(paths.len());

    for p in &paths {
        let path = Path::new(p);
        let resolved = if path.is_absolute() {
            Some(path.to_path_buf())
        } else {
            [root.clone(), parent.clone()]
                .into_iter()
                .flatten()
                .map(|base| base.join(path))
                .find(|c| c.exists())
        };
        let Some(abs) = resolved.filter(|c| c.exists()) else {
            out.push("missing".to_string());
            continue;
        };
        let abs = std::fs::canonicalize(&abs).unwrap_or(abs);
        let dir = abs.parent().unwrap_or(&abs).to_path_buf();

        let top = tops
            .entry(dir.clone())
            .or_insert_with(|| git_top_level(&dir))
            .clone();
        let Some(top) = top else {
            out.push("unknown".to_string());
            continue;
        };

        let map = changes
            .entry(top.clone())
            .or_insert_with(|| repo_changes(&top));
        let rel = abs
            .strip_prefix(&top)
            .ok()
            .map(|r| r.to_string_lossy().replace('\\', "/"));
        out.push(
            rel.and_then(|r| map.get(&r).cloned())
                .unwrap_or_else(|| "untouched".to_string()),
        );
    }

    out
}

/// Path to the most recent completed run's `spec.json` for a project, if any.
///
/// Runs live in `~/.lirah/designs/<repo>/<iso-stamp>/`, and ISO stamps sort
/// lexicographically, so "newest" is just the largest directory name that
/// actually contains a spec. A dedicated command rather than `read_directory`
/// because that one is cached, and a stale listing would hide the newest run —
/// exactly the one worth loading.
#[tauri::command]
pub async fn latest_design_run(designs_dir: String) -> Option<String> {
    let entries = std::fs::read_dir(&designs_dir).ok()?;
    let mut best: Option<(String, PathBuf)> = None;

    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let spec = entry.path().join("spec.json");
        if !spec.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if best.as_ref().is_none_or(|(b, _)| name > *b) {
            best = Some((name, spec));
        }
    }
    best.map(|(_, path)| path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_against_root_and_preserves_order() {
        let dir = std::env::temp_dir().join(format!("lirah-verify-test-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src/real.js"), "x").unwrap();

        let root = dir.to_string_lossy().to_string();
        let result = tauri::async_runtime::block_on(paths_exist(
            vec![
                "src/real.js".to_string(),
                "src/ghost.js".to_string(),
                "src/real.js".to_string(),
            ],
            Some(root.clone()),
        ));
        assert_eq!(result, vec![true, false, true]);

        // Absolute paths ignore the root entirely.
        let abs = dir.join("src/real.js").to_string_lossy().to_string();
        let result = tauri::async_runtime::block_on(paths_exist(
            vec![abs, "/definitely/not/here.js".to_string()],
            Some(root),
        ));
        assert_eq!(result, vec![true, false]);

        // A directory counts as existing — the caller only asks about presence.
        let result = tauri::async_runtime::block_on(paths_exist(
            vec!["src".to_string()],
            Some(dir.to_string_lossy().to_string()),
        ));
        assert_eq!(result, vec![true]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_sibling_repo_paths_via_the_parent_directory() {
        let ws = std::env::temp_dir().join(format!("lirah-verify-ws-{}", std::process::id()));
        let repo = ws.join("my-api");
        std::fs::create_dir_all(repo.join("src")).unwrap();
        std::fs::create_dir_all(ws.join("SiblingUI/src")).unwrap();
        std::fs::write(repo.join("src/own.rs"), "x").unwrap();
        std::fs::write(ws.join("SiblingUI/src/tile.tsx"), "x").unwrap();

        let result = tauri::async_runtime::block_on(paths_exist(
            vec![
                "src/own.rs".to_string(),          // under the repo itself
                "SiblingUI/src/tile.tsx".to_string(), // under the workspace parent
                "SiblingUI/src/ghost.tsx".to_string(), // nowhere
            ],
            Some(repo.to_string_lossy().to_string()),
        ));
        assert_eq!(result, vec![true, true, false]);

        let _ = std::fs::remove_dir_all(&ws);
    }

    #[test]
    fn classifies_added_modified_and_untouched_against_the_branch_point() {
        let dir = std::env::temp_dir().join(format!("lirah-change-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        let git = |args: &[&str]| {
            let ok = Command::new("git")
                .current_dir(&dir)
                .args(args)
                .output()
                .expect("git");
            assert!(ok.status.success(), "git {:?} failed", args);
        };

        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@t"]);
        git(&["config", "user.name", "t"]);
        std::fs::write(dir.join("src/old.rs"), "old").unwrap();
        std::fs::write(dir.join("src/edited.rs"), "one").unwrap();
        std::fs::write(dir.join("src/stable.rs"), "never touched").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);

        // Work happens on a branch: one file committed-new, one committed-edit,
        // one still uncommitted, one untracked.
        git(&["checkout", "-qb", "feature"]);
        std::fs::write(dir.join("src/born.rs"), "new").unwrap();
        std::fs::write(dir.join("src/edited.rs"), "two").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "work"]);
        std::fs::write(dir.join("src/dirty.rs"), "untracked").unwrap();
        std::fs::write(dir.join("src/old.rs"), "touched").unwrap();

        let result = tauri::async_runtime::block_on(paths_change_status(
            vec![
                "src/born.rs".to_string(),
                "src/edited.rs".to_string(),
                "src/dirty.rs".to_string(),
                "src/old.rs".to_string(),
                "src/stable.rs".to_string(),
                "src/ghost.rs".to_string(),
            ],
            Some(dir.to_string_lossy().to_string()),
        ));
        assert_eq!(
            result,
            vec!["added", "modified", "added", "modified", "untouched", "missing"]
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_input_is_empty_output() {
        assert!(tauri::async_runtime::block_on(paths_exist(vec![], None)).is_empty());
    }

    #[test]
    fn latest_run_picks_the_newest_dir_that_has_a_spec() {
        let base = std::env::temp_dir().join(format!("lirah-runs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        for stamp in ["2026-08-14T09-00-00-000Z", "2026-08-14T12-30-37-729Z"] {
            std::fs::create_dir_all(base.join(stamp)).unwrap();
            std::fs::write(base.join(stamp).join("spec.json"), "{}").unwrap();
        }
        // Newer, but the run failed before writing a spec — must be skipped.
        std::fs::create_dir_all(base.join("2026-08-14T13-00-00-000Z")).unwrap();

        let found =
            tauri::async_runtime::block_on(latest_design_run(base.to_string_lossy().to_string()))
                .unwrap();
        assert!(found.ends_with("2026-08-14T12-30-37-729Z/spec.json"), "got {}", found);

        // Missing directory is None, not an error.
        assert!(tauri::async_runtime::block_on(latest_design_run(
            base.join("nope").to_string_lossy().to_string()
        ))
        .is_none());

        let _ = std::fs::remove_dir_all(&base);
    }
}
