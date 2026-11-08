//! Feature map: which files implement each of the project's features, kept in
//! .orchestration/tools/features.json. The compaction hook (compaction/hook.js)
//! reads it to hand an agent the files of a feature its prompt names. The
//! prompts come from src/features/compact/featureMapPrompt.js.
//!
//! A full build asks the model for the whole map. An update only touches what
//! git says changed since the map's `gitSha`: deleted and renamed files are
//! fixed here, edited files keep their place, and only new files go to the
//! model, together with the feature list, not the code. No new files means no
//! model call at all.

use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::plans::claude_print;

const MODEL_CMD: &str = "claude --print --model sonnet --effort medium --allowedTools Read Grep Glob";
// Past this many new files a full build costs about the same and maps them better.
const UPDATE_MAX_NEW_FILES: usize = 150;

/// Build or update the map. `update_prompt` is None to force a full build.
/// Returns a one-line summary for the toast. A model answer that fails the
/// checks leaves the old map in place.
#[tauri::command]
pub async fn build_feature_map(
    project_dir: String,
    prompt: String,
    update_prompt: Option<String>,
) -> Result<String, String> {
    crate::ipc::blocking("build_feature_map", move || build(&project_dir, &prompt, update_prompt.as_deref())).await
}

fn build(dir: &str, prompt: &str, update_prompt: Option<&str>) -> Result<String, String> {
    let path = map_path(dir);
    // Read before the model runs: a checkout mid-build must not relabel the map.
    let head = git(dir, &["rev-parse", "--short", "HEAD"]).filter(|s| !s.is_empty());
    exclude_orchestration_from_git(dir); // else features.json itself shows up as a new file
    let update = update_prompt.zip(read_map(&path)).and_then(|(p, map)| plan_update(dir, map).map(|u| (p, u)));
    let (mut map, summary) = match update {
        Some((instructions, (mut map, new_files, summary))) => {
            if !new_files.is_empty() {
                let out = claude_print(MODEL_CMD, dir, &update_prompt_text(instructions, &map, &new_files))?;
                merge_new_files(&mut map, &out, &new_files)?;
            }
            (map, summary)
        }
        None => {
            let map = json_in(&claude_print(MODEL_CMD, dir, prompt)?)?;
            let count = check_features(&map["features"])?;
            (map, format!("Mapped {} features", count))
        }
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);
    map["version"] = 1.into();
    map["generatedAt"] = now.into(); // unix ms
    map["gitSha"] = head.map_or(Value::Null, Into::into);

    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| format!("Failed to create {}: {}", path.display(), e))?;
    let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json + "\n").map_err(|e| format!("Failed to write features.json: {}", e))?;
    Ok(summary)
}

/// The saved map (null when there is none) and how far it lags HEAD:
/// `{ map, head, commitsBehind, newFiles, missingFiles }`. The counts are null when the
/// map's `gitSha` is missing or unreachable.
#[tauri::command]
pub async fn read_feature_map(project_dir: String) -> Result<Value, String> {
    crate::ipc::blocking("read_feature_map", move || Ok(read_with_freshness(&project_dir))).await
}

fn read_with_freshness(dir: &str) -> Value {
    let map = read_map(&map_path(dir));
    let sha = map.as_ref().and_then(|m| m["gitSha"].as_str()).map(String::from);
    let behind = sha.as_ref().and_then(|s| git(dir, &["rev-list", "--count", &format!("{}..HEAD", s), "--", "."]));
    let counts = map.clone().zip(sha).and_then(|(mut m, s)| {
        let mut c = changes_since(dir, &s)?;
        c.added.retain(|p| !p.starts_with(".orchestration/")); // in case the hook never excluded it
        // Map files gone from the tree, e.g. after checking out a branch without them.
        let listed: HashSet<&str> = m["features"].as_array().into_iter().flatten()
            .filter_map(|f| f["files"].as_array()).flatten().filter_map(Value::as_str).collect();
        let missing = c.deleted.iter().filter(|p| listed.contains(p.as_str())).count();
        Some((apply_changes(&mut m, &c).len(), missing))
    });
    serde_json::json!({
        "map": map,
        "head": git(dir, &["rev-parse", "--short", "HEAD"]),
        "commitsBehind": behind.and_then(|n| n.parse::<u64>().ok()),
        "newFiles": counts.map(|c| c.0),
        "missingFiles": counts.map(|c| c.1),
    })
}

fn map_path(dir: &str) -> PathBuf {
    Path::new(dir).join(".orchestration").join("tools").join("features.json")
}

/// The saved map, if it is one an update can build on.
fn read_map(path: &Path) -> Option<Value> {
    let map: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    (map.is_object() && map["features"].is_array()).then_some(map)
}

/// Apply git's changes since the map's commit. Returns the updated map, the new
/// files the model must place, and a summary; None means do a full build instead.
fn plan_update(dir: &str, mut map: Value) -> Option<(Value, Vec<String>, String)> {
    let sha = map["gitSha"].as_str()?.to_string();
    let changes = changes_since(dir, &sha)?;
    let new_files = apply_changes(&mut map, &changes);
    if new_files.len() > UPDATE_MAX_NEW_FILES {
        return None;
    }
    let summary = format!(
        "Updated the feature map: {} new, {} renamed, {} deleted files",
        new_files.len(),
        changes.renamed.len(),
        changes.deleted.len()
    );
    Some((map, new_files, summary))
}

/// Git's changes since `sha`, untracked files counted as added.
fn changes_since(dir: &str, sha: &str) -> Option<Changes> {
    let mut changes = parse_name_status(&git(dir, &["diff", "--relative", "--name-status", "-M", sha, "--"])?);
    let untracked = git(dir, &["ls-files", "--others", "--exclude-standard"])?;
    changes.added.extend(untracked.lines().filter(|l| !l.is_empty()).map(String::from));
    Some(changes)
}

#[derive(Default)]
struct Changes {
    added: Vec<String>,
    deleted: Vec<String>,
    renamed: Vec<(String, String)>,
}

/// `git diff --name-status -M` lines. Edits (M, T) don't move a file between
/// features, so they are left out.
fn parse_name_status(text: &str) -> Changes {
    let mut c = Changes::default();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        match (parts[0].chars().next(), &parts[1..]) {
            (Some('A'), [p]) => c.added.push(p.to_string()),
            (Some('D'), [p]) => c.deleted.push(p.to_string()),
            (Some('R'), [from, to]) => c.renamed.push((from.to_string(), to.to_string())),
            (Some('C'), [_, to]) => c.added.push(to.to_string()),
            _ => {}
        }
    }
    c
}

/// Drop deleted files and follow renames in every feature's `files` and
/// `entryPoints` and in `ignored`. Returns the added or renamed-in files the map
/// doesn't know yet (the ones the model has to place), sorted.
fn apply_changes(map: &mut Value, c: &Changes) -> Vec<String> {
    let gone: HashSet<&str> = c.deleted.iter().map(String::as_str).collect();
    let moved: HashMap<&str, &str> = c.renamed.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
    let mut known = HashSet::new();
    let mut fix = |list: &mut Vec<Value>| {
        list.retain(|p| !p.as_str().is_some_and(|p| gone.contains(p)));
        for p in list.iter_mut() {
            if let Some(to) = p.as_str().and_then(|s| moved.get(s)) {
                *p = (*to).into();
            }
        }
        known.extend(list.iter().filter_map(|p| p.as_str().map(String::from)));
    };
    for f in map["features"].as_array_mut().into_iter().flatten() {
        for key in ["files", "entryPoints"] {
            if let Some(list) = f.get_mut(key).and_then(Value::as_array_mut) {
                fix(list);
            }
        }
    }
    if let Some(list) = map.get_mut("ignored").and_then(Value::as_array_mut) {
        fix(list);
    }
    let mut new: Vec<String> = c
        .added
        .iter()
        .chain(c.renamed.iter().map(|(_, to)| to))
        .filter(|p| !known.contains(p.as_str()))
        .cloned()
        .collect();
    new.sort();
    new.dedup();
    new
}

/// The update prompt: the instructions, the feature list (no files) and the new files.
fn update_prompt_text(instructions: &str, map: &Value, new_files: &[String]) -> String {
    let mut s = format!("{}\n\nCurrent features:\n", instructions);
    for f in map["features"].as_array().into_iter().flatten() {
        let text = |k: &str| f[k].as_str().unwrap_or("").to_string();
        s += &format!("- {}: {} — {}\n", text("id"), text("name"), text("description"));
    }
    s += "\nNew files:\n";
    for p in new_files {
        s += &format!("- {}\n", p);
    }
    s
}

/// Merge the model's `{"files": {path: [ids]}, "features": [...]}` answer. Only
/// the new files are taken from it; the ones it places nowhere go to `ignored`,
/// so later updates don't ask about them again.
fn merge_new_files(map: &mut Value, out: &str, new_files: &[String]) -> Result<(), String> {
    let answer = json_in(out)?;
    if !answer["features"].is_null() {
        check_features(&answer["features"])?;
    }
    let features = map["features"].as_array_mut().ok_or("features.json has no feature list")?;
    for f in answer["features"].as_array().into_iter().flatten() {
        if !features.iter().any(|x| x["id"] == f["id"]) {
            features.push(f.clone());
        }
    }
    let mut placed: HashSet<&str> = HashSet::new();
    for path in new_files {
        for id in answer["files"][path.as_str()].as_array().into_iter().flatten() {
            let list = features.iter_mut().find(|f| f["id"] == *id).and_then(|f| f.get_mut("files")).and_then(Value::as_array_mut);
            if let Some(list) = list {
                if !list.iter().any(|p| p == path.as_str()) {
                    list.push(path.as_str().into());
                }
                placed.insert(path);
            }
        }
        if features.iter().any(|f| f["files"].as_array().is_some_and(|l| l.iter().any(|p| p == path.as_str()))) {
            placed.insert(path);
        }
    }
    let skipped: Vec<Value> = new_files.iter().filter(|p| !placed.contains(p.as_str())).map(|p| p.as_str().into()).collect();
    if !skipped.is_empty() {
        if !map["ignored"].is_array() {
            map["ignored"] = Value::Array(vec![]);
        }
        map["ignored"].as_array_mut().unwrap().extend(skipped);
    }
    Ok(())
}

/// The JSON object in the model's answer (it may wrap it in prose).
fn json_in(out: &str) -> Result<Value, String> {
    let json = match (out.find('{'), out.rfind('}')) {
        (Some(a), Some(b)) if a < b => &out[a..=b],
        _ => return Err("claude's answer has no feature map".into()),
    };
    let value: Value = serde_json::from_str(json).map_err(|e| format!("claude's feature map is not valid JSON: {}", e))?;
    if value.is_object() { Ok(value) } else { Err("claude's feature map is not a JSON object".into()) }
}

/// A non-empty list of features that each have an id, a name and files. Returns the count.
fn check_features(features: &Value) -> Result<usize, String> {
    let list = features.as_array().filter(|f| !f.is_empty()).ok_or("claude's feature map lists no features")?;
    if let Some(bad) = list.iter().find(|f| !(f["id"].is_string() && f["name"].is_string() && f["files"].is_array())) {
        return Err(format!("feature without an id, name or files: {}", bad));
    }
    Ok(list.len())
}

/// Trimmed stdout of a git command in `dir`; None when it fails.
fn git(dir: &str, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["-C", dir, "-c", "core.quotePath=false"])
        .args(args)
        .output()
        .ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Keep .orchestration/ out of git, as compaction/hook.js does (the map may be
/// built before the hook ever ran in this project).
fn exclude_orchestration_from_git(dir: &str) {
    if git(dir, &["check-ignore", "-q", ".orchestration/tools/x"]).is_some() {
        return;
    }
    if let Some(exclude) = git(dir, &["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]) {
        let exclude = Path::new(&exclude);
        if let Some(parent) = exclude.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(exclude) {
            let _ = f.write_all(b"\n.orchestration/\n");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_answers_that_would_wipe_a_good_map() {
        assert!(json_in("sorry, I could not").is_err());
        assert!(json_in("{not json}").is_err());
        assert!(check_features(&json!([])).is_err());
        assert!(check_features(&json!([{ "id": "x" }])).is_err());
        let map = json_in("Here:\n{\"features\":[{\"id\":\"plans\",\"name\":\"Plans\",\"files\":[]}]}\nDone.").unwrap();
        assert_eq!(check_features(&map["features"]), Ok(1));
    }

    #[test]
    fn update_follows_git_and_asks_only_about_new_files() {
        let mut map = json!({ "features": [
            { "id": "plans", "name": "Plans", "files": ["src/a.js", "src/old.js", "src/gone.js"], "entryPoints": ["src/old.js"] },
        ], "ignored": ["src/util.js"] });
        let changes = parse_name_status("M\tsrc/a.js\nD\tsrc/gone.js\nR087\tsrc/old.js\tsrc/new.js\nA\tsrc/b.js\nA\tsrc/util.js\nR100\tsrc/x.js\tsrc/y.js\n");
        let new_files = apply_changes(&mut map, &changes);
        assert_eq!(map["features"][0]["files"], json!(["src/a.js", "src/new.js"]));
        assert_eq!(map["features"][0]["entryPoints"], json!(["src/new.js"]));
        assert_eq!(new_files, vec!["src/b.js", "src/y.js"]);

        let answer = r#"{"files": {"src/b.js": ["plans"], "src/y.js": [], "src/invented.js": ["plans"]},
            "features": [{"id": "tasks", "name": "Tasks", "files": ["src/t.js"]}]}"#;
        merge_new_files(&mut map, answer, &new_files).unwrap();
        assert_eq!(map["features"][0]["files"], json!(["src/a.js", "src/new.js", "src/b.js"]));
        assert_eq!(map["features"][1]["id"], "tasks");
        assert_eq!(map["ignored"], json!(["src/util.js", "src/y.js"]));
    }

    #[test]
    fn update_with_no_new_files_skips_the_model() {
        let dir = std::env::temp_dir().join(format!("lirah-feature-map-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        let d = dir.to_str().unwrap();
        let sh = |args: &[&str]| assert!(git(d, args).is_some(), "git {:?}", args);
        sh(&["init", "-q"]);
        for f in ["a.js", "b.js", "old.js"] {
            std::fs::write(dir.join("src").join(f), f).unwrap();
        }
        sh(&["add", "."]);
        sh(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
        let sha = git(d, &["rev-parse", "--short", "HEAD"]).unwrap();
        let map = json!({ "gitSha": sha, "features": [{ "id": "x", "name": "X", "files": ["src/a.js", "src/b.js", "src/old.js"] }] });
        std::fs::create_dir_all(map_path(d).parent().unwrap()).unwrap();
        std::fs::write(map_path(d), map.to_string()).unwrap();

        std::fs::remove_file(dir.join("src/b.js")).unwrap();
        sh(&["mv", "src/old.js", "src/new.js"]);
        // An unreachable model command would fail the build if it were called.
        let summary = build(d, "full prompt", Some("update prompt")).unwrap();
        assert!(summary.contains("0 new, 1 renamed, 1 deleted"), "{}", summary);
        let saved = read_map(&map_path(d)).unwrap();
        assert_eq!(saved["features"][0]["files"], json!(["src/a.js", "src/new.js"]));
        assert_eq!(saved["version"], 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_reports_how_far_the_map_lags_head() {
        let dir = std::env::temp_dir().join(format!("lirah-feature-map-read-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let d = dir.to_str().unwrap();
        let sh = |args: &[&str]| assert!(git(d, args).is_some(), "git {:?}", args);
        let commit = |f: &str| {
            std::fs::write(dir.join(f), f).unwrap();
            sh(&["add", "."]);
            sh(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", f]);
        };
        sh(&["init", "-q"]);
        exclude_orchestration_from_git(d); // else the map gets committed and blocks the checkout
        commit("a.js");

        // No file.
        let r = read_with_freshness(d);
        assert!(r["map"].is_null() && r["commitsBehind"].is_null() && r["newFiles"].is_null(), "{}", r);
        assert!(r["head"].is_string());

        // Fresh.
        let sha = git(d, &["rev-parse", "--short", "HEAD"]).unwrap();
        let map = json!({ "gitSha": sha, "features": [{ "id": "x", "name": "X", "files": ["a.js"] }], "ignored": ["c.js"] });
        std::fs::create_dir_all(map_path(d).parent().unwrap()).unwrap();
        std::fs::write(map_path(d), map.to_string()).unwrap();
        let r = read_with_freshness(d);
        assert_eq!((r["commitsBehind"].clone(), r["newFiles"].clone()), (json!(0), json!(0)), "{}", r);
        assert_eq!(r["map"]["features"][0]["id"], "x");
        assert_eq!(r["head"], sha);

        // Two commits behind: one new file, one already ignored.
        commit("b.js");
        commit("c.js");
        let r = read_with_freshness(d);
        assert_eq!((r["commitsBehind"].clone(), r["newFiles"].clone()), (json!(2), json!(1)), "{}", r);
        assert_ne!(r["head"], sha);
        assert_eq!(r["missingFiles"], json!(0), "{}", r);

        // Map built on a branch with b.js, then checked out back to the first commit.
        let b_sha = git(d, &["rev-parse", "--short", "HEAD"]).unwrap();
        let map = json!({ "gitSha": b_sha, "features": [{ "id": "x", "name": "X", "files": ["a.js", "b.js"] }], "ignored": ["c.js"] });
        std::fs::write(map_path(d), map.to_string()).unwrap();
        sh(&["checkout", "-q", &sha]);
        let r = read_with_freshness(d);
        assert_eq!((r["commitsBehind"].clone(), r["newFiles"].clone(), r["missingFiles"].clone()), (json!(0), json!(0), json!(1)), "{}", r);
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn freshness_is_scoped_to_a_project_in_a_repo_subfolder() {
        let root = std::env::temp_dir().join(format!("lirah-feature-map-sub-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let dir = root.join("app");
        std::fs::create_dir_all(&dir).unwrap();
        let (r, d) = (root.to_str().unwrap(), dir.to_str().unwrap());
        let sh = |args: &[&str]| assert!(git(r, args).is_some(), "git {:?}", args);
        let commit = |path: &std::path::Path| {
            std::fs::write(path, path.to_str().unwrap()).unwrap(); // distinct content, so no rename detection
            sh(&["add", "."]);
            sh(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c"]);
        };
        sh(&["init", "-q"]);
        exclude_orchestration_from_git(d);
        commit(&dir.join("a.js"));
        let sha = git(d, &["rev-parse", "--short", "HEAD"]).unwrap();
        let map = json!({ "gitSha": sha, "features": [{ "id": "x", "name": "X", "files": ["a.js"] }] });
        std::fs::create_dir_all(map_path(d).parent().unwrap()).unwrap();
        std::fs::write(map_path(d), map.to_string()).unwrap();

        // Outside the project: no effect.
        commit(&root.join("other.txt"));
        let f = read_with_freshness(d);
        assert_eq!((f["commitsBehind"].clone(), f["newFiles"].clone(), f["missingFiles"].clone()), (json!(0), json!(0), json!(0)), "{}", f);

        // Inside: a deleted file matches the map's project-relative path.
        sh(&["rm", "-q", "app/a.js"]);
        commit(&dir.join("b.js"));
        let f = read_with_freshness(d);
        assert_eq!((f["commitsBehind"].clone(), f["newFiles"].clone(), f["missingFiles"].clone()), (json!(1), json!(1), json!(1)), "{}", f);
        let _ = std::fs::remove_dir_all(&root);
    }
}
