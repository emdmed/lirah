//! Build a design-oriented digest of a *branch* — the second answer to "which
//! feature are we diagramming?"
//!
//! The conversation digest (`digest.rs`) says what someone *meant* to build; a
//! branch says what actually got built. For a feature that is finished and
//! sitting on a branch, the diff against the merge-base is a far sharper scope
//! boundary than the last chat session: it is exactly the set of files the
//! feature touched, with the commit messages as the narrative.
//!
//! What goes in, in priority order:
//!
//!   - the branch/base identification and totals,
//!   - commit subjects and bodies,
//!   - the full name-status list of changed files (cheap, and the grounding
//!     signal the extractor needs most),
//!   - uncommitted work, so a feature in progress reads correctly,
//!   - the actual patch, per file, clipped — spent last because it is the part
//!     that can run to megabytes.
//!
//! The patch is included at all because "what changed inside this file" is what
//! separates a node the feature *extended* from one it merely calls. The
//! extractor can always read the current file itself; it cannot reconstruct the
//! before-state.

use super::verify::{git_top_level, resolve_base, run_git};
use serde::Serialize;
use std::path::Path;

/// Total digest budget, matched to the session digest so both sources leave the
/// extractor the same room to explore the repo.
const DEFAULT_MAX_CHARS: usize = 240_000;

/// Cap on one file's patch, so a single generated or vendored file cannot eat
/// the whole budget before the interesting files are reached.
const MAX_FILE_PATCH_CHARS: usize = 8_000;

/// Cap on how many changed paths are listed. Beyond this the list is noise, and
/// a branch this wide is not one feature.
const MAX_FILES_LISTED: usize = 300;

/// Fraction of the budget reserved for everything that is not the patch. The
/// patch only gets what is left, and never crowds out the file list.
const PATCH_BUDGET_RATIO: f32 = 0.75;

#[derive(Debug, Clone, Serialize)]
pub struct BranchDigest {
    pub digest: String,
    /// The ref the comparison used, e.g. `origin/main`.
    pub base: String,
    /// Merge-base commit, short form.
    pub base_sha: String,
    /// Current branch name, or `(detached)`.
    pub branch: String,
    pub commit_count: usize,
    pub file_count: usize,
    /// Files with uncommitted changes, including untracked.
    pub dirty_count: usize,
    pub chars: usize,
    /// True when patches were dropped or clipped to fit the budget.
    pub truncated: bool,
    /// Every changed path, repo-relative, in git's order.
    pub files_touched: Vec<String>,
}

/// What the source picker needs to describe this option before committing to a
/// run: which branch, against what, and how much is in it.
#[derive(Debug, Clone, Serialize)]
pub struct BranchSummary {
    /// False when there is no repo, no resolvable base, or nothing changed —
    /// `reason` then says which.
    pub available: bool,
    pub reason: Option<String>,
    pub branch: Option<String>,
    pub base: Option<String>,
    pub base_sha: Option<String>,
    pub commit_count: usize,
    pub file_count: usize,
    pub dirty_count: usize,
}

/// One branch the user could compare against.
#[derive(Debug, Clone, Serialize)]
pub struct BaseRef {
    /// Short name, e.g. `origin/main` or `develop` — what git is handed.
    pub name: String,
    /// `remote` or `local`, so the picker can group them.
    pub kind: String,
    /// Relative age of its tip, e.g. "3 days ago" — the cheapest way to tell a
    /// live branch from one abandoned last year.
    pub age: String,
}

/// The candidate bases for a repo, newest tip first.
#[derive(Debug, Clone, Serialize)]
pub struct BaseChoices {
    /// What auto-detection would pick, so the picker can preselect and label it.
    pub detected: Option<String>,
    /// The branch we are on. Excluded from `refs` — diffing it against itself is
    /// empty — but worth naming in the UI.
    pub current: Option<String>,
    pub refs: Vec<BaseRef>,
}

/// Cap on how many refs the picker is offered. A repo can carry hundreds of
/// stale remote branches; sorted newest-first, the tail is never the answer.
const MAX_BASE_REFS: usize = 60;

/// Generated, vendored or lock files: they are real changes and stay in the file
/// list, but their *patch* teaches nothing about the design and is enormous.
fn patch_is_noise(path: &str) -> bool {
    const EXACT: [&str; 6] = [
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "Cargo.lock",
        "poetry.lock",
        "composer.lock",
    ];
    let name = path.rsplit('/').next().unwrap_or(path);
    if EXACT.contains(&name) {
        return true;
    }
    const DIRS: [&str; 5] = ["dist/", "build/", "node_modules/", "vendor/", ".next/"];
    DIRS.iter().any(|d| path.starts_with(d) || path.contains(&format!("/{}", d)))
        || path.ends_with(".min.js")
        || path.ends_with(".map")
        || path.ends_with(".snap")
}

fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max).collect();
    format!("{}\n… [{} chars of this patch omitted]", kept, text.chars().count() - max)
}

fn current_branch(top: &Path) -> String {
    run_git(top, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD")
        .unwrap_or_else(|| "(detached)".to_string())
}

/// `<letter> <path>` pairs from `--name-status -z`. Renames and copies emit two
/// paths; the new one is what the diagram points at.
fn name_status(out: &str) -> Vec<(char, String)> {
    let mut fields = out.split('\0').filter(|f| !f.is_empty());
    let mut pairs = Vec::new();
    while let Some(code) = fields.next() {
        let letter = code.chars().next().unwrap_or(' ');
        let path = if letter == 'R' || letter == 'C' {
            fields.next();
            fields.next()
        } else {
            fields.next()
        };
        let Some(path) = path else { break };
        pairs.push((letter, path.replace('\\', "/")));
    }
    pairs
}

/// Uncommitted work as `XY path` lines, plus the count.
fn working_tree(top: &Path) -> (Vec<String>, usize) {
    let Some(out) = run_git(top, &["status", "--porcelain=v1", "-z", "-uall"]) else {
        return (Vec::new(), 0);
    };
    let mut fields = out.split('\0').filter(|f| !f.is_empty());
    let mut lines = Vec::new();
    while let Some(entry) = fields.next() {
        let mut chars = entry.chars();
        let (x, y) = (chars.next().unwrap_or(' '), chars.next().unwrap_or(' '));
        let path = entry.get(3..).unwrap_or("");
        if x == 'R' || x == 'C' || y == 'R' || y == 'C' {
            fields.next();
        }
        if path.is_empty() {
            continue;
        }
        lines.push(format!("{}{} {}", x, y, path.replace('\\', "/")));
    }
    let count = lines.len();
    (lines, count)
}

/// Untracked files as pseudo-patch chunks.
///
/// `git diff` says nothing about a file git has never seen — and for a new
/// feature that is often *every* interesting file. Without this the digest lists
/// `src/NewThing.jsx` as added and then shows nothing of what is in it, which is
/// the one file the reader most needs. There is no read-only way to make git
/// diff an untracked file against nothing, so the content is emitted directly
/// under a header that says what it is.
fn untracked_chunks(top: &Path) -> Vec<(String, String)> {
    let Some(out) = run_git(top, &["ls-files", "--others", "--exclude-standard", "-z"]) else {
        return Vec::new();
    };
    let mut chunks = Vec::new();
    for path in out.split('\0').filter(|p| !p.is_empty()) {
        let path = path.replace('\\', "/");
        let Ok(bytes) = std::fs::read(top.join(&path)) else { continue };
        // A NUL byte means binary: its contents are noise and can be enormous.
        if bytes.contains(&0) {
            continue;
        }
        let Ok(text) = String::from_utf8(bytes) else { continue };
        chunks.push((
            path.clone(),
            format!("--- new file, not yet committed: {} ---\n{}\n", path, text),
        ));
    }
    chunks
}

/// Split a unified diff into per-file chunks keyed by the path in its
/// `diff --git` header.
fn split_patch(diff: &str) -> Vec<(String, String)> {
    let mut chunks: Vec<(String, String)> = Vec::new();
    for part in diff.split("\ndiff --git ") {
        let part = part.strip_prefix("diff --git ").unwrap_or(part);
        if part.trim().is_empty() {
            continue;
        }
        let header = part.lines().next().unwrap_or("");
        // `a/path b/path` — take the b-side, which is the post-change path.
        let path = header
            .split(" b/")
            .nth(1)
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| header.trim().to_string());
        chunks.push((path, format!("diff --git {}", part)));
    }
    chunks
}

/// Build a digest of what this branch changed relative to its base.
///
/// `base_ref` overrides base detection; when it does not resolve, detection runs
/// as usual rather than failing, and the digest reports which base was used.
///
/// `async` for the same reason as the session digest: Tauri runs synchronous
/// commands on the main thread, which on Linux is the GTK/WebKit UI thread, and
/// several `git` invocations on a large repo are long enough to be felt.
#[tauri::command]
pub async fn build_branch_digest(
    project_path: String,
    base_ref: Option<String>,
    max_chars: Option<usize>,
) -> Result<BranchDigest, String> {
    let budget = max_chars.unwrap_or(DEFAULT_MAX_CHARS).max(4_000);
    let dir = Path::new(&project_path);
    let top = git_top_level(dir)
        .ok_or_else(|| format!("{} is not inside a git repository.", project_path))?;

    let (base, base_full) = resolve_base(&top, base_ref.as_deref()).ok_or_else(|| {
        "Could not work out which branch this one forked from — no origin/HEAD, main, master or \
         develop resolved. Diagram from the conversation instead, or name a base explicitly."
            .to_string()
    })?;
    let base_sha = base_full.chars().take(8).collect::<String>();
    let branch = current_branch(&top);
    let range = format!("{}..HEAD", base_full);

    // --- commits ---
    // Unit-separated fields, record-separated commits: subjects and bodies both
    // contain newlines often enough that line-based parsing loses them.
    let commits: Vec<(String, String, String)> =
        run_git(&top, &["log", "--format=%h%x1f%s%x1f%b%x1e", "--no-merges", &range])
            .map(|out| {
                out.split('\u{1e}')
                    .map(str::trim)
                    .filter(|r| !r.is_empty())
                    .map(|record| {
                        let mut parts = record.split('\u{1f}');
                        (
                            parts.next().unwrap_or("").trim().to_string(),
                            parts.next().unwrap_or("").trim().to_string(),
                            parts.next().unwrap_or("").trim().to_string(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();

    // --- changed files ---
    // Committed and uncommitted work are one feature, so the file list is the
    // union: `base..HEAD` plus everything still in the working tree.
    let committed = run_git(&top, &["diff", "--name-status", "-z", &base_full, "HEAD"])
        .map(|out| name_status(&out))
        .unwrap_or_default();
    let (dirty_lines, dirty_count) = working_tree(&top);

    let mut files_touched: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut listed: Vec<String> = Vec::new();
    for (letter, path) in &committed {
        if seen.insert(path.clone()) {
            files_touched.push(path.clone());
            listed.push(format!("  {} {}", letter, path));
        }
    }
    for line in &dirty_lines {
        let path = line.get(3..).unwrap_or("").to_string();
        if !path.is_empty() && seen.insert(path.clone()) {
            files_touched.push(path);
        }
    }

    if files_touched.is_empty() {
        return Err(format!(
            "Nothing to diagram: {} has no changes against {} and no uncommitted work.",
            branch, base
        ));
    }

    let stat = run_git(&top, &["diff", "--shortstat", &base_full, "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // --- header and narrative ---
    let mut head = String::new();
    head.push_str("# Branch digest\n");
    head.push_str(&format!("branch: {}\n", branch));
    head.push_str(&format!("base: {} (merge-base {})\n", base, base_sha));
    head.push_str(&format!("commits: {}\n", commits.len()));
    head.push_str(&format!("files changed: {}\n", files_touched.len()));
    if let Some(stat) = &stat {
        head.push_str(&format!("stat: {}\n", stat));
    }
    if dirty_count > 0 {
        head.push_str(&format!("uncommitted: {} path(s)\n", dirty_count));
    }

    if !commits.is_empty() {
        head.push_str("\n## commits (oldest last)\n");
        for (sha, subject, body) in &commits {
            head.push_str(&format!("- {} {}\n", sha, subject));
            for line in body.lines().filter(|l| !l.trim().is_empty()).take(12) {
                head.push_str(&format!("    {}\n", line.trim()));
            }
        }
    }

    let mut files_truncated = false;
    head.push_str("\n## files changed (A=added M=modified D=deleted R=renamed)\n");
    for line in listed.iter().take(MAX_FILES_LISTED) {
        head.push_str(line);
        head.push('\n');
    }
    if listed.len() > MAX_FILES_LISTED {
        files_truncated = true;
        head.push_str(&format!("  … and {} more\n", listed.len() - MAX_FILES_LISTED));
    }

    if !dirty_lines.is_empty() {
        head.push_str("\n## uncommitted (not yet in a commit)\n");
        for line in dirty_lines.iter().take(MAX_FILES_LISTED) {
            head.push_str(&format!("  {}\n", line));
        }
    }

    // --- patch, with whatever budget is left ---
    let mut patch_budget = budget.saturating_sub(head.len());
    let ceiling = (budget as f32 * PATCH_BUDGET_RATIO) as usize;
    patch_budget = patch_budget.min(ceiling);

    let mut patch = String::new();
    let mut skipped_noise = 0usize;
    let mut skipped_budget = 0usize;

    if patch_budget > 1_000 {
        let mut chunks = run_git(
            &top,
            &["diff", "--unified=3", "--no-color", "-M", &base_full, "HEAD"],
        )
        .map(|d| split_patch(&d))
        .unwrap_or_default();
        // Uncommitted work last: it is the newest thinking, but committed work is
        // the bulk of the feature and must not be starved by it.
        if dirty_count > 0 {
            if let Some(d) = run_git(&top, &["diff", "--unified=3", "--no-color", "-M", "HEAD"]) {
                chunks.extend(split_patch(&d));
            }
            chunks.extend(untracked_chunks(&top));
        }

        for (path, body) in chunks {
            if patch_is_noise(&path) {
                skipped_noise += 1;
                continue;
            }
            let clipped = clip(&body, MAX_FILE_PATCH_CHARS);
            if patch.len() + clipped.len() > patch_budget {
                skipped_budget += 1;
                continue;
            }
            if clipped.len() < body.len() {
                files_truncated = true;
            }
            patch.push_str(&clipped);
            if !patch.ends_with('\n') {
                patch.push('\n');
            }
        }
    } else {
        skipped_budget = files_touched.len();
    }

    let mut digest = head;
    if !patch.is_empty() {
        digest.push_str("\n## patch\n\n");
        digest.push_str(&patch);
    }
    if skipped_noise > 0 || skipped_budget > 0 {
        files_truncated |= skipped_budget > 0;
        digest.push_str(&format!(
            "\nnote: {} generated/lock file(s) and {} file(s) had their patch omitted — read those \
             files directly if the list above says they matter.\n",
            skipped_noise, skipped_budget
        ));
    }

    let chars = digest.len();
    Ok(BranchDigest {
        digest,
        base,
        base_sha,
        branch,
        commit_count: commits.len(),
        file_count: files_touched.len(),
        dirty_count,
        chars,
        truncated: files_truncated,
        files_touched,
    })
}

/// Cheap probe for the source picker: can we diagram this branch, and what
/// would it cover? Never fails — an unavailable source is a `reason` string the
/// picker can show, not an error to handle.
#[tauri::command]
pub async fn branch_diff_summary(
    project_path: String,
    base_ref: Option<String>,
) -> BranchSummary {
    let unavailable = |reason: &str| BranchSummary {
        available: false,
        reason: Some(reason.to_string()),
        branch: None,
        base: None,
        base_sha: None,
        commit_count: 0,
        file_count: 0,
        dirty_count: 0,
    };

    let Some(top) = git_top_level(Path::new(&project_path)) else {
        return unavailable("Not a git repository.");
    };
    let Some((base, base_full)) = resolve_base(&top, base_ref.as_deref()) else {
        return unavailable("No base branch found (looked for origin/HEAD, main, master, develop).");
    };
    let branch = current_branch(&top);

    let commit_count = run_git(
        &top,
        &["rev-list", "--count", "--no-merges", &format!("{}..HEAD", base_full)],
    )
    .and_then(|s| s.trim().parse::<usize>().ok())
    .unwrap_or(0);

    let committed = run_git(&top, &["diff", "--name-status", "-z", &base_full, "HEAD"])
        .map(|out| name_status(&out))
        .unwrap_or_default();
    let (dirty_lines, dirty_count) = working_tree(&top);

    let mut seen = std::collections::HashSet::new();
    for (_, path) in &committed {
        seen.insert(path.clone());
    }
    for line in &dirty_lines {
        if let Some(path) = line.get(3..) {
            seen.insert(path.replace('\\', "/"));
        }
    }

    BranchSummary {
        available: !seen.is_empty(),
        reason: if seen.is_empty() {
            Some(format!("{} has no changes against {}.", branch, base))
        } else {
            None
        },
        branch: Some(branch),
        base: Some(base),
        base_sha: Some(base_full.chars().take(8).collect()),
        commit_count,
        file_count: seen.len(),
        dirty_count,
    }
}

/// Every branch this repo could be compared against.
///
/// Auto-detection is a good guess, not an answer: a repo can carry `main`,
/// `develop` and a long-lived release branch, and only the person who wrote the
/// feature knows which one it is meant to land on. So the choice is offered
/// explicitly, with the detected ref marked as the default rather than imposed
/// as the only option.
///
/// Never fails: no repo, or a repo with no other branch, comes back as an empty
/// list with `detected`/`current` unset, which the picker shows as "nothing to
/// compare against".
#[tauri::command]
pub async fn list_base_choices(project_path: String) -> BaseChoices {
    let Some(top) = git_top_level(Path::new(&project_path)) else {
        return BaseChoices { detected: None, current: None, refs: Vec::new() };
    };
    let current = current_branch(&top);
    let detected = resolve_base(&top, None).map(|(name, _)| name);

    // Newest tip first: on a repo with 200 remote branches, recency is the only
    // ordering that puts the plausible bases on screen.
    let out = run_git(
        &top,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)%1f%(refname)%1f%(committerdate:relative)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .unwrap_or_default();

    let mut refs: Vec<BaseRef> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in out.lines() {
        let mut parts = line.split('\u{1f}');
        let name = parts.next().unwrap_or("").trim().to_string();
        let full = parts.next().unwrap_or("").trim();
        let age = parts.next().unwrap_or("").trim().to_string();
        if name.is_empty() || name == current {
            continue;
        }
        // `origin/HEAD` is a symbolic alias for another entry in this same list.
        if name.ends_with("/HEAD") {
            continue;
        }
        if !seen.insert(name.clone()) {
            continue;
        }
        refs.push(BaseRef {
            name,
            kind: if full.starts_with("refs/remotes/") { "remote" } else { "local" }.to_string(),
            age,
        });
    }

    // The detected default leads, wherever recency put it.
    if let Some(detected) = &detected {
        if let Some(pos) = refs.iter().position(|r| &r.name == detected) {
            let hit = refs.remove(pos);
            refs.insert(0, hit);
        }
    }
    refs.truncate(MAX_BASE_REFS);

    BaseChoices {
        detected,
        current: Some(current),
        refs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// A throwaway repo with a `main` and a feature branch on top of it.
    fn scratch_repo(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("lirah-branch-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();

        let git = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@t.t"]);
        git(&["config", "user.name", "t"]);
        std::fs::write(dir.join("src/stable.rs"), "fn old() {}\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);

        git(&["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.join("src/born.rs"), "fn brand_new() {}\n").unwrap();
        std::fs::write(dir.join("src/stable.rs"), "fn old() {}\nfn grown() {}\n").unwrap();
        std::fs::write(dir.join("package-lock.json"), "{\"lots\":\"of noise\"}\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "feat: the feature\n\nwhy it exists"]);
        // Something still uncommitted, which a real in-progress feature has.
        std::fs::write(dir.join("src/dirty.rs"), "fn wip() {}\n").unwrap();
        dir
    }

    #[test]
    fn digest_covers_commits_files_and_patch() {
        let dir = scratch_repo("digest");
        let d = tauri::async_runtime::block_on(build_branch_digest(
            dir.to_string_lossy().to_string(),
            Some("main".to_string()),
            None,
        ))
        .unwrap();

        assert_eq!(d.branch, "feature");
        assert_eq!(d.base, "main");
        assert_eq!(d.commit_count, 1);
        assert_eq!(d.dirty_count, 1);
        // born + stable + package-lock committed, plus the untracked dirty file.
        assert_eq!(d.file_count, 4);
        assert!(d.files_touched.contains(&"src/born.rs".to_string()));
        assert!(d.files_touched.contains(&"src/dirty.rs".to_string()));

        assert!(d.digest.contains("feat: the feature"), "commit subject missing");
        assert!(d.digest.contains("why it exists"), "commit body missing");
        assert!(d.digest.contains("A src/born.rs"), "name-status missing");
        assert!(d.digest.contains("fn brand_new()"), "patch missing");
        assert!(d.digest.contains("fn wip()"), "uncommitted patch missing");
        // The lock file is listed but its patch is not.
        assert!(d.digest.contains("package-lock.json"));
        assert!(!d.digest.contains("lots"), "lock file patch leaked");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The file list is the grounding signal and must never be the thing that
    /// gets sacrificed — a starved budget drops patches instead.
    #[test]
    fn tiny_budget_keeps_the_file_list_and_drops_the_patch() {
        let dir = scratch_repo("budget");
        let git = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        // Enough patch to overrun the floor below several times over.
        std::fs::write(dir.join("src/big.rs"), "fn f() {}\n".repeat(2_000)).unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "big"]);

        let d = tauri::async_runtime::block_on(build_branch_digest(
            dir.to_string_lossy().to_string(),
            Some("main".to_string()),
            Some(4_000),
        ))
        .unwrap();
        assert!(d.digest.contains("A src/born.rs"), "file list must survive");
        assert!(d.digest.contains("A src/big.rs"));
        assert!(d.truncated, "dropping patches must be reported");
        assert!(d.digest.contains("patch omitted"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn one_huge_file_is_clipped_rather_than_starving_the_others() {
        let dir = scratch_repo("clip");
        let git = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        // Well past MAX_FILE_PATCH_CHARS on its own.
        std::fs::write(dir.join("src/huge.rs"), "fn f() {}\n".repeat(5_000)).unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "huge"]);

        let d = tauri::async_runtime::block_on(build_branch_digest(
            dir.to_string_lossy().to_string(),
            Some("main".to_string()),
            None,
        ))
        .unwrap();
        assert!(d.truncated);
        assert!(d.digest.contains("chars of this patch omitted"));
        // The clip is per-file, so the small files still get their patch.
        assert!(d.digest.contains("fn brand_new()"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn summary_reports_an_empty_branch_as_unavailable() {
        let dir = scratch_repo("empty");
        let git = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        std::fs::remove_file(dir.join("src/dirty.rs")).unwrap();
        git(&["checkout", "-q", "main"]);

        let s = tauri::async_runtime::block_on(branch_diff_summary(
            dir.to_string_lossy().to_string(),
            Some("main".to_string()),
        ));
        assert!(!s.available);
        assert!(s.reason.unwrap().contains("no changes"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn summary_counts_what_the_branch_covers() {
        let dir = scratch_repo("summary");
        let s = tauri::async_runtime::block_on(branch_diff_summary(
            dir.to_string_lossy().to_string(),
            Some("main".to_string()),
        ));
        assert!(s.available);
        assert_eq!(s.branch.as_deref(), Some("feature"));
        assert_eq!(s.commit_count, 1);
        assert_eq!(s.file_count, 4);
        assert_eq!(s.dirty_count, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn base_choices_lead_with_the_detected_ref_and_exclude_the_current_branch() {
        let dir = scratch_repo("choices");
        let git = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        git(&["branch", "release-1.0"]);

        let c = tauri::async_runtime::block_on(list_base_choices(dir.to_string_lossy().to_string()));
        assert_eq!(c.current.as_deref(), Some("feature"));
        assert_eq!(c.detected.as_deref(), Some("main"), "no remote, so local main");
        assert_eq!(c.refs.first().map(|r| r.name.as_str()), Some("main"));
        let names: Vec<&str> = c.refs.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"release-1.0"));
        assert!(!names.contains(&"feature"), "the current branch is not a base");
        assert!(c.refs.iter().all(|r| r.kind == "local" && !r.age.is_empty()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn base_choices_on_a_non_repo_are_empty_rather_than_an_error() {
        let dir = std::env::temp_dir().join(format!("lirah-nochoices-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let c = tauri::async_runtime::block_on(list_base_choices(dir.to_string_lossy().to_string()));
        assert!(c.refs.is_empty() && c.detected.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn not_a_repo_is_an_error_for_the_digest_and_a_reason_for_the_summary() {
        let dir = std::env::temp_dir().join(format!("lirah-norepo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.to_string_lossy().to_string();
        assert!(tauri::async_runtime::block_on(build_branch_digest(path.clone(), None, None)).is_err());
        let s = tauri::async_runtime::block_on(branch_diff_summary(path, None));
        assert!(!s.available && s.reason.is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
