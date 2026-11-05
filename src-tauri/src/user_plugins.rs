//! User plugins: a folder of tools and skills plus a prompt, turned into a
//! Claude Code plugin the launcher loads with `--plugin-dir`. The plugin
//! copies the folder's skills and injects the prompt (and a list of the
//! folder's scripts) as context at session start.

use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_DEPTH: usize = 4;
const MAX_TOOLS: usize = 50;
const TOOL_EXTS: &[&str] = &["sh", "bash", "zsh", "py", "js", "mjs", "ts", "ps1", "cmd", "bat"];

/// Skill dirs (each holds a SKILL.md) and tool files (relative to the folder).
#[derive(Debug, Default)]
struct Scan {
    skills: Vec<PathBuf>,
    tools: Vec<PathBuf>,
}

fn skipped(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target"
}

fn is_tool(path: &Path, rel: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if TOOL_EXTS.contains(&ext.as_str()) {
        return true;
    }
    if rel.parent().map_or(false, |p| p.components().any(|c| c.as_os_str() == "bin")) {
        return true;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            return meta.permissions().mode() & 0o111 != 0;
        }
    }
    false
}

fn scan_plugin_folder(folder: &Path) -> Scan {
    let mut scan = Scan::default();
    let mut walk = WalkDir::new(folder).max_depth(MAX_DEPTH).sort_by_file_name().into_iter();
    while let Some(entry) = walk.next() {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy();
        if entry.depth() > 0 && skipped(&name) {
            if entry.file_type().is_dir() {
                walk.skip_current_dir();
            }
            continue;
        }
        let path = entry.path();
        if entry.file_type().is_dir() {
            // A skill dir is copied whole; its scripts belong to the skill.
            if path.join("SKILL.md").is_file() {
                scan.skills.push(path.to_path_buf());
                walk.skip_current_dir();
            }
        } else if entry.file_type().is_file() {
            let rel = path.strip_prefix(folder).unwrap_or(path);
            if is_tool(path, rel) {
                scan.tools.push(rel.to_path_buf());
            }
        }
    }
    scan
}

fn slug(s: &str) -> String {
    let out: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "plugin".into() } else { out }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    for entry in WalkDir::new(from).into_iter().filter_map(Result::ok) {
        let rel = entry.path().strip_prefix(from).unwrap_or(entry.path());
        let dest = to.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&dest)?;
        } else if entry.file_type().is_file() {
            fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

fn context_text(name: &str, folder: &Path, prompt: &str, scan: &Scan, skill_names: &[String]) -> String {
    let mut text = format!("# Plugin: {}\nFolder: {}\n", name, folder.display());
    if !prompt.trim().is_empty() {
        text += &format!("\n{}\n", prompt.trim());
    }
    if !scan.tools.is_empty() {
        text += "\nTools in this folder (paths relative to it):\n";
        for tool in scan.tools.iter().take(MAX_TOOLS) {
            text += &format!("- {}\n", tool.display());
        }
        if scan.tools.len() > MAX_TOOLS {
            text += &format!("- …and {} more\n", scan.tools.len() - MAX_TOOLS);
        }
    }
    if !skill_names.is_empty() {
        text += &format!("\nSkills from this plugin: {}\n", skill_names.join(", "));
    }
    text
}

/// Build the plugin into `dir`: manifest, copied skills, and a SessionStart
/// hook that prints the context.
fn build(dir: &Path, name: &str, folder: &Path, prompt: &str) -> Result<(), String> {
    let err = |e: std::io::Error| e.to_string();
    let scan = scan_plugin_folder(folder);

    let manifest = serde_json::json!({
        "name": format!("lirah-plugin-{}", slug(name)),
        "version": "1.0.0",
        "author": { "name": "Lirah" },
        "description": format!("User plugin {} from {}", name, folder.display()),
    });
    let meta = dir.join(".claude-plugin");
    fs::create_dir_all(&meta).map_err(err)?;
    fs::write(meta.join("plugin.json"), manifest.to_string()).map_err(err)?;

    let mut skill_names: Vec<String> = Vec::new();
    for skill in &scan.skills {
        let base = skill.file_name().map(|n| slug(&n.to_string_lossy())).unwrap_or_else(|| "skill".into());
        let mut unique = base.clone();
        let mut n = 2;
        while skill_names.contains(&unique) {
            unique = format!("{}-{}", base, n);
            n += 1;
        }
        copy_dir(skill, &dir.join("skills").join(&unique)).map_err(err)?;
        skill_names.push(unique);
    }

    let text = context_text(name, folder, prompt, &scan, &skill_names);
    let script = dir.join("context.js");
    let js = format!("process.stdout.write({});\n", serde_json::Value::String(text));
    fs::write(&script, js).map_err(err)?;
    let hooks = serde_json::json!({ "hooks": { "SessionStart": [{ "hooks": [
        { "type": "command", "command": crate::util::node_command(&script), "timeout": 5 }
    ] }] } });
    fs::create_dir_all(dir.join("hooks")).map_err(err)?;
    fs::write(dir.join("hooks").join("hooks.json"), hooks.to_string()).map_err(err)?;
    Ok(())
}

/// Regenerate the plugin for one user plugin and return its directory, for
/// the launcher's `--plugin-dir`. Rebuilt on every launch so edits in the
/// folder show up in the next session.
#[tauri::command]
pub async fn install_user_plugin(id: String, name: String, folder: String, prompt: String) -> Result<String, String> {
    crate::ipc::blocking("install_user_plugin", move || {
        let folder = PathBuf::from(&folder);
        if !folder.is_dir() {
            return Err(format!("folder not found: {}", folder.display()));
        }
        let root = crate::util::lirah_dir().ok_or("No home directory")?.join("plugins");
        let dir = root.join(slug(&id));
        // Built aside and swapped in, so a tab launching at the same moment
        // never sees a half-written plugin.
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = root.join(format!(".{}-{}-{}", slug(&id), std::process::id(), stamp));
        if let Err(e) = build(&tmp, &name, &folder, &prompt) {
            let _ = fs::remove_dir_all(&tmp);
            return Err(e);
        }
        let _ = fs::remove_dir_all(&dir);
        fs::rename(&tmp, &dir).map_err(|e| {
            let _ = fs::remove_dir_all(&tmp);
            e.to_string()
        })?;
        Ok(dir.to_string_lossy().into_owned())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_skills_and_tools_and_builds_plugin() {
        let base = std::env::temp_dir().join(format!("lirah-user-plugin-{}", std::process::id()));
        let src = base.join("src");
        let _ = fs::remove_dir_all(&base);
        for d in ["skills/a", "bin", ".git", "node_modules/x", "docs"] {
            fs::create_dir_all(src.join(d)).unwrap();
        }
        fs::write(src.join("skills/a/SKILL.md"), "---\nname: a\n---\n").unwrap();
        fs::write(src.join("skills/a/helper.py"), "").unwrap();
        fs::write(src.join("bin/az-wrap"), "").unwrap();
        fs::write(src.join("deploy.sh"), "").unwrap();
        fs::write(src.join(".git/hook.sh"), "").unwrap();
        fs::write(src.join("node_modules/x/run.js"), "").unwrap();
        fs::write(src.join("docs/notes.md"), "").unwrap();

        let scan = scan_plugin_folder(&src);
        assert_eq!(scan.skills, vec![src.join("skills/a")]);
        assert_eq!(scan.tools, vec![PathBuf::from("bin/az-wrap"), PathBuf::from("deploy.sh")]);

        let out = base.join("out");
        build(&out, "Azure tools", &src, "Use bin/az-wrap for az.").unwrap();
        assert!(out.join("skills/a/SKILL.md").is_file());
        assert!(out.join("skills/a/helper.py").is_file());
        let js = fs::read_to_string(out.join("context.js")).unwrap();
        assert!(js.contains("Use bin/az-wrap for az."));
        assert!(js.contains("deploy.sh"));
        let manifest = fs::read_to_string(out.join(".claude-plugin/plugin.json")).unwrap();
        assert!(manifest.contains("lirah-plugin-azure-tools"));
        let _ = fs::remove_dir_all(&base);
    }
}
