//! Project compaction for Claude Code, through a hook, switched on per tab.
//!
//! `engine/` is a copy of `public/tools/compaction.js` and `parse-utils.js`
//! from agentic-orchestration-worflows (agentic-compaction v0.0.10), the engine
//! its hooks run. To update it, copy both files over.
//!
//! Lirah writes the engine, `hook.js` and a Claude Code plugin under
//! ~/.lirah/compaction. The launcher loads the plugin with `--plugin-dir`, so
//! every Claude Code that Lirah starts runs the hook on each prompt. The hook
//! does nothing unless its terminal (`LIRAH_PTY_SESSION`) has a marker in
//! `on/`; the tab's switch writes or removes it, so a toggle applies on the
//! next prompt without restarting the agent.
//!
//! Switched on, the hook works like the compaction part of the orchestration
//! repo's `classify.sh`: it rebuilds `.orchestration/tools/compacted_*.md`
//! when sources changed and tells the agent to grep it before reading source.

use std::fs;
use std::path::{Path, PathBuf};

const COMPACTION_JS: &str = include_str!("engine/compaction.js");
const PARSE_UTILS_JS: &str = include_str!("engine/parse-utils.js");
// The engine is an ES module; this makes Node load it as one on any version.
const PACKAGE_JSON: &str = "{\"type\":\"module\"}\n";

const HOOK_JS: &str = include_str!("hook.js");

fn compaction_dir() -> Option<PathBuf> {
    crate::util::lirah_dir().map(|d| d.join("compaction"))
}

fn plugin_dir() -> Option<PathBuf> {
    compaction_dir().map(|d| d.join("claude-plugin"))
}

/// Marker for a terminal whose tab has compaction on.
fn session_marker(session_id: &str) -> Option<PathBuf> {
    // Session ids are UUIDs; anything else can't name a file here.
    if session_id.is_empty() || !session_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    compaction_dir().map(|d| d.join("on").join(session_id))
}

fn write_if_changed(path: &Path, contents: &str) -> Result<(), String> {
    if fs::read_to_string(path).ok().as_deref() == Some(contents) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    fs::write(path, contents).map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

/// Write the engine, the hook script and the plugin that registers it.
fn install() -> Result<PathBuf, String> {
    let dir = compaction_dir().ok_or("No home directory")?;
    write_if_changed(&dir.join("compaction.js"), COMPACTION_JS)?;
    write_if_changed(&dir.join("parse-utils.js"), PARSE_UTILS_JS)?;
    write_if_changed(&dir.join("package.json"), PACKAGE_JSON)?;

    let script = dir.join("hook.js");
    write_if_changed(&script, HOOK_JS)?;
    // Left by builds that shipped the hook as a shell script.
    let _ = fs::remove_file(dir.join("hook.sh"));
    fs::create_dir_all(dir.join("on")).map_err(|e| e.to_string())?;

    let to_json = |v: serde_json::Value| serde_json::to_string_pretty(&v).map_err(|e| e.to_string());
    let plugin = plugin_dir().ok_or("No home directory")?;
    let manifest = to_json(serde_json::json!({
        "name": "lirah-compaction",
        "version": "1.0.0",
        "author": { "name": "Lirah" },
        "description": "Keeps a grep-first index of the project fresh and points the agent at it, for Lirah tabs with compaction on."
    }))?;
    write_if_changed(&plugin.join(".claude-plugin").join("plugin.json"), &manifest)?;
    // A rebuild is capped at 6s inside the script; the rest is headroom.
    let hooks = to_json(serde_json::json!({
        "hooks": {
            "UserPromptSubmit": [{
                "hooks": [{ "type": "command", "command": crate::util::node_command(&script), "timeout": 15 }]
            }]
        }
    }))?;
    write_if_changed(&plugin.join("hooks").join("hooks.json"), &hooks)?;
    Ok(plugin)
}

/// Install at startup so the plugin is ready for the first launch. A failure
/// only costs the feature: the launcher then leaves the plugin out.
pub fn start() {
    if let Err(e) = install() {
        eprintln!("[compaction] install failed: {}", e);
    }
}

/// Drop a closed terminal's marker.
pub fn forget_session(session_id: &str) {
    if let Some(marker) = session_marker(session_id) {
        let _ = fs::remove_file(marker);
    }
}

/// The plugin directory the launcher passes to Claude Code with `--plugin-dir`.
#[tauri::command]
pub fn get_compaction_plugin_dir() -> Option<String> {
    plugin_dir()
        .filter(|p| p.join("hooks").join("hooks.json").exists())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Switch the compaction hook on or off for one terminal.
#[tauri::command]
pub async fn set_compaction_hook(session_id: String, enabled: bool) -> Result<(), String> {
    crate::ipc::blocking("set_compaction_hook", move || {
        let marker = session_marker(&session_id).ok_or("Invalid terminal session")?;
        if enabled {
            write_if_changed(&marker, "")
        } else {
            match fs::remove_file(&marker) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            }
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn rejects_session_ids_that_are_not_file_names() {
        assert!(session_marker("../../etc/passwd").is_none());
        assert!(session_marker("").is_none());
        assert!(session_marker("3f2a-9b1c").is_some());
    }

    /// Run hook.js with an engine copy in a temp dir against a tiny project.
    fn run_hook(dir: &Path, project: &Path, session: &str) -> String {
        let mut child = Command::new("node")
            .arg(dir.join("hook.js"))
            .env("LIRAH_PTY_SESSION", session)
            .env("CLAUDE_PROJECT_DIR", project)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        drop(child.stdin.take());
        String::from_utf8(child.wait_with_output().unwrap().stdout).unwrap()
    }

    #[test]
    fn hook_runs_only_for_switched_on_terminals() {
        if Command::new("node").arg("--version").output().is_err() {
            return; // no Node on this machine
        }
        let root = std::env::temp_dir().join(format!("lirah-compaction-{}", std::process::id()));
        let dir = root.join("engine");
        let project = root.join("proj");
        fs::create_dir_all(dir.join("on")).unwrap();
        fs::create_dir_all(project.join("src")).unwrap();
        fs::write(dir.join("compaction.js"), COMPACTION_JS).unwrap();
        fs::write(dir.join("parse-utils.js"), PARSE_UTILS_JS).unwrap();
        fs::write(dir.join("package.json"), PACKAGE_JSON).unwrap();
        fs::write(dir.join("hook.js"), HOOK_JS).unwrap();
        fs::write(project.join("src/main.js"), "export function main() { return 1; }\n").unwrap();

        assert_eq!(run_hook(&dir, &project, "off-session"), "");

        fs::write(dir.join("on").join("on-session"), "").unwrap();
        let first = run_hook(&dir, &project, "on-session");
        assert!(first.contains("COMPACTION: refreshed → .orchestration/tools/compacted_proj_"), "{}", first);
        assert!(first.contains("GREP: "));
        let second = run_hook(&dir, &project, "on-session");
        assert!(second.contains("COMPACTION: current → "), "{}", second);

        let _ = fs::remove_dir_all(&root);
    }
}
