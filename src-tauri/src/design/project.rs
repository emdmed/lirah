//! Build a design-oriented digest of a whole *project* — the third answer to
//! "what are we diagramming?"
//!
//! The conversation and branch digests describe a piece of work. This one
//! describes the repository itself, for a diagram of the whole system broken
//! into domains and features. Nobody can hand the extractor a whole codebase,
//! so this is a map rather than the territory:
//!
//!   - the directory tree, with file counts and the languages in each folder —
//!     the strongest single clue to where the domain boundaries are,
//!   - a code outline of every file the app can parse: its local imports, its
//!     exports and functions. JS/TS/Python outlines are compacted in the webview
//!     (the same compaction the composer offers) and passed in; Rust is outlined
//!     here. The imports are real dependency edges, so the extractor can draw
//!     flows from them instead of guessing, and reads far fewer files,
//!   - the manifests (package.json, Cargo.toml, …), which name the deployables
//!     and their dependencies,
//!   - the README and any architecture notes the authors left,
//!   - the opening lines of likely entry points the outline does not cover,
//!   - every other file path, while the budget allows.
//!
//! The extractor is told to read files to confirm anything it claims; this only
//! has to point it at the right ones.

use super::verify::{git_top_level, run_git};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;

/// Matched to the other digests, so every source leaves the extractor the same
/// room to explore.
const DEFAULT_MAX_CHARS: usize = 700_000;

/// Beyond this many files the per-file list is dropped: the tree already says
/// where everything is, and a list this long is noise.
const MAX_FILES_LISTED: usize = 4_000;

const MAX_MANIFESTS: usize = 24;
const MANIFEST_CHARS: usize = 8_000;
const DOC_CHARS: usize = 14_000;
const MAX_ENTRY_POINTS: usize = 24;
const ENTRY_LINES: usize = 80;

/// Lines kept from one Rust file's outline; past this it is a list, not a shape.
const RUST_OUTLINE_LINES: usize = 60;

/// Directories that are never part of the design, even when not gitignored.
const SKIP_DIRS: [&str; 14] = [
    ".git", "node_modules", "target", "dist", "build", "vendor", ".next", "__pycache__",
    ".venv", "venv", ".idea", ".vscode", "coverage", ".cache",
];

const MANIFEST_NAMES: [&str; 16] = [
    "package.json", "Cargo.toml", "pyproject.toml", "setup.py", "requirements.txt", "go.mod",
    "Gemfile", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "mix.exs",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "tauri.conf.json",
];

const DOC_NAMES: [&str; 6] =
    ["README.md", "ARCHITECTURE.md", "CLAUDE.md", "AGENTS.md", "DESIGN.md", "CONTRIBUTING.md"];

/// File stems that usually start a program or wire a subsystem together.
const ENTRY_STEMS: [&str; 10] =
    ["main", "index", "app", "lib", "server", "mod", "routes", "router", "api", "cli"];

const SOURCE_EXTS: [&str; 22] = [
    "rs", "js", "jsx", "ts", "tsx", "mjs", "py", "go", "rb", "java", "kt", "cs", "php", "ex",
    "exs", "swift", "c", "cc", "cpp", "h", "vue", "svelte",
];

#[derive(Debug, Clone, Serialize)]
pub struct ProjectDigest {
    pub digest: String,
    pub chars: usize,
    /// True when a section had to be clipped or left out to fit the budget.
    pub truncated: bool,
    pub file_count: usize,
    pub dir_count: usize,
    pub branch: Option<String>,
    /// How many files the code outline describes.
    pub outlined_files: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectSummary {
    pub available: bool,
    pub reason: Option<String>,
    pub file_count: usize,
    pub dir_count: usize,
    pub branch: Option<String>,
}

fn is_noise(path: &str) -> bool {
    const EXTS: [&str; 22] = [
        "png", "jpg", "jpeg", "gif", "ico", "icns", "webp", "bmp", "woff", "woff2", "ttf", "otf",
        "eot", "pdf", "zip", "gz", "tar", "mp4", "mp3", "wasm", "map", "snap",
    ];
    const LOCKS: [&str; 6] = [
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock",
        "Gemfile.lock",
    ];
    let name = path.rsplit('/').next().unwrap_or(path);
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    LOCKS.contains(&name)
        || EXTS.contains(&ext.as_str())
        || name.ends_with(".min.js")
        || path.split('/').any(|seg| SKIP_DIRS.contains(&seg))
}

/// Every file in the project, repo-relative to `root`, sorted. Git decides when
/// there is a repository (so `.gitignore` is respected); otherwise a walk that
/// skips the usual build and dependency folders.
fn list_files(root: &Path) -> Vec<String> {
    let from_git = git_top_level(root).and_then(|_| {
        run_git(root, &["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    });
    let mut files: Vec<String> = match from_git {
        Some(out) => out
            .split('\0')
            .filter(|p| !p.is_empty())
            .map(|p| p.replace('\\', "/"))
            .collect(),
        None => walkdir::WalkDir::new(root)
            .into_iter()
            .filter_entry(|e| {
                e.depth() == 0 || !SKIP_DIRS.contains(&e.file_name().to_string_lossy().as_ref())
            })
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| {
                e.path()
                    .strip_prefix(root)
                    .ok()
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
            })
            .collect(),
    };
    files.retain(|p| !is_noise(p) && root.join(p).is_file());
    files.sort();
    files.dedup();
    files
}

fn parent_dir(path: &str) -> &str {
    path.rsplit_once('/').map(|(d, _)| d).unwrap_or(".")
}

fn ext_of(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default()
}

/// One line per directory: path, file count, and its top extensions. Indented
/// by depth so the extractor can see the shape at a glance.
fn render_tree(files: &[String]) -> (String, usize) {
    let mut dirs: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    for f in files {
        // Register every ancestor so empty-of-files intermediate folders still
        // appear in the tree.
        let mut dir = parent_dir(f).to_string();
        *dirs.entry(dir.clone()).or_default().entry(ext_of(f)).or_default() += 1;
        while let Some((up, _)) = dir.rsplit_once('/') {
            dirs.entry(up.to_string()).or_default();
            dir = up.to_string();
        }
        if dir != "." {
            dirs.entry(dir).or_default();
        }
    }
    let mut out = String::new();
    for (dir, exts) in &dirs {
        let depth = if dir == "." { 0 } else { dir.matches('/').count() + 1 };
        let total: usize = exts.values().sum();
        let mut top: Vec<(&String, &usize)> = exts.iter().collect();
        top.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));
        let breakdown = top
            .iter()
            .take(4)
            .map(|(e, n)| if e.is_empty() { format!("{} other", n) } else { format!("{} .{}", n, e) })
            .collect::<Vec<_>>()
            .join(", ");
        let indent = "  ".repeat(depth.saturating_sub(1));
        let name = if dir == "." { "./".to_string() } else { format!("{}/", dir) };
        if total == 0 {
            out.push_str(&format!("{}{}\n", indent, name));
        } else {
            out.push_str(&format!("{}{}  ({} files: {})\n", indent, name, total, breakdown));
        }
    }
    (out, dirs.len())
}

fn read_clipped(path: &Path, max: usize) -> Option<(String, bool)> {
    let text = std::fs::read_to_string(path).ok()?;
    if text.chars().count() <= max {
        return Some((text, false));
    }
    let kept: String = text.chars().take(max).collect();
    Some((format!("{}\n… [clipped]", kept), true))
}

fn head_lines(path: &Path, n: usize) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let lines: Vec<&str> = text.lines().take(n).collect();
    let more = text.lines().count() > n;
    Some(format!("{}{}", lines.join("\n"), if more { "\n…" } else { "" }))
}

/// Outline one Rust file: its local `use`s on one line, then its items —
/// functions, types, traits, impls, modules — as one-line signatures, with
/// Tauri commands marked since they are the frontend's way into the core.
/// Stops at `#[cfg(test)]`; tests are not part of the design.
fn rust_outline(text: &str) -> String {
    const ITEMS: [&str; 18] = [
        "pub fn ", "fn ", "pub async fn ", "async fn ", "pub(crate) fn ", "pub(crate) async fn ",
        "pub struct ", "struct ", "pub(crate) struct ", "pub enum ", "enum ", "pub trait ",
        "trait ", "impl ", "impl<", "pub mod ", "mod ", "pub type ",
    ];
    let mut imports: Vec<String> = Vec::new();
    let mut items: Vec<String> = Vec::new();
    let mut command = false;
    for line in text.lines() {
        let t = line.trim_start();
        let indent = line.len() - t.len();
        if indent == 0 && t.starts_with("#[cfg(test)]") {
            break;
        }
        if t.starts_with("#[tauri::command") {
            command = true;
            continue;
        }
        if t.starts_with("#[") || t.starts_with("//") || t.is_empty() {
            continue;
        }
        if indent == 0 && (t.starts_with("use crate::") || t.starts_with("use super::")) {
            imports.push(t.trim_start_matches("use ").trim_end_matches(';').to_string());
        } else if indent <= 4 && ITEMS.iter().any(|p| t.starts_with(p)) {
            let sig = t.split('{').next().unwrap_or(t).trim_end().trim_end_matches(';');
            let sig: String = sig.chars().take(140).collect();
            items.push(if command { format!("[command] {}", sig) } else { sig });
        }
        command = false;
    }
    let mut out = Vec::new();
    if !imports.is_empty() {
        out.push(format!("imports: {}", imports.join(", ")));
    }
    let more = items.len().saturating_sub(RUST_OUTLINE_LINES);
    out.extend(items.into_iter().take(RUST_OUTLINE_LINES));
    if more > 0 {
        out.push(format!("… +{} more items", more));
    }
    out.join("\n")
}

/// Shallow paths first: a top-level `main.rs` says more about the system than a
/// fixture's `index.js` six folders down.
fn entry_points(files: &[String]) -> Vec<String> {
    let mut found: Vec<&String> = files
        .iter()
        .filter(|f| {
            let name = f.rsplit('/').next().unwrap_or(f);
            let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
            ENTRY_STEMS.contains(&stem.to_ascii_lowercase().as_str())
                && SOURCE_EXTS.contains(&ext)
                && !f.contains("test")
                && !f.contains("fixture")
                && !f.contains("example")
        })
        .collect();
    found.sort_by_key(|f| (f.matches('/').count(), f.len()));
    found.into_iter().take(MAX_ENTRY_POINTS).cloned().collect()
}

fn branch_of(root: &Path) -> Option<String> {
    run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD")
}

/// Build the project map the extractor starts from.
///
/// `async` for the same reason as the other digests: Tauri runs synchronous
/// commands on the UI thread, and listing a large repository there would freeze
/// the window.
#[tauri::command]
///
/// `outline` is the webview's compaction of the JS/TS/Python files — `## path`
/// headers each followed by that file's skeleton. It is optional: without it
/// the digest falls back to entry-point heads and the file list for those.
pub async fn build_project_digest(
    project_path: String,
    max_chars: Option<usize>,
    outline: Option<String>,
) -> Result<ProjectDigest, String> {
    let budget = max_chars.unwrap_or(DEFAULT_MAX_CHARS).max(4_000);
    let root = Path::new(&project_path);
    if !root.is_dir() {
        return Err(format!("{} is not a folder.", project_path));
    }
    let files = list_files(root);
    if files.is_empty() {
        return Err("This folder has no source files to diagram.".to_string());
    }
    let branch = branch_of(root);
    let name = root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let (tree, dir_count) = render_tree(&files);
    let mut truncated = false;

    // Sections in priority order; each is only added while the budget lasts,
    // and the tree always goes in because it is the point of the digest.
    let mut out = format!(
        "# Project digest: {}\n\n{} files in {} folders{}\n\n## Directory tree\n\n{}\n",
        name,
        files.len(),
        dir_count,
        branch.as_deref().map(|b| format!(" · branch {}", b)).unwrap_or_default(),
        tree
    );

    let fits = |out: &String, extra: usize| out.len() + extra <= budget;

    // --- docs ---
    let mut docs = String::new();
    for doc in DOC_NAMES {
        if let Some((text, clipped)) = read_clipped(&root.join(doc), DOC_CHARS) {
            truncated |= clipped;
            // Fenced, so a doc's own headings cannot pass for digest sections.
            // Tildes, because docs routinely contain backtick fences.
            docs.push_str(&format!("### {}\n\n~~~~markdown\n{}\n~~~~\n\n", doc, text.trim()));
        }
    }
    if !docs.is_empty() {
        if fits(&out, docs.len()) {
            out.push_str("## Project docs\n\n");
            out.push_str(&docs);
        } else {
            truncated = true;
        }
    }

    // --- manifests, at any depth (monorepos keep one per package) ---
    let manifests: Vec<&String> = files
        .iter()
        .filter(|f| MANIFEST_NAMES.contains(&f.rsplit('/').next().unwrap_or(f)))
        .take(MAX_MANIFESTS)
        .collect();
    if !manifests.is_empty() {
        out.push_str("## Manifests\n\n");
        for m in manifests {
            let Some((text, clipped)) = read_clipped(&root.join(m), MANIFEST_CHARS) else {
                continue;
            };
            let section = format!("### {}\n\n```\n{}\n```\n\n", m, text.trim());
            if !fits(&out, section.len()) {
                truncated = true;
                break;
            }
            truncated |= clipped;
            out.push_str(&section);
        }
    }

    // --- code outline: the webview's compaction, plus Rust outlined here ---
    let mut covered: HashSet<String> = HashSet::new();
    let mut outline_text = String::new();
    if let Some(compacted) = outline.as_deref().filter(|o| !o.trim().is_empty()) {
        for line in compacted.lines() {
            if let Some(path) = line.strip_prefix("## ") {
                covered.insert(path.trim().to_string());
                outline_text.push_str("### ");
                outline_text.push_str(path.trim());
                outline_text.push('\n');
            } else {
                outline_text.push_str(line);
                outline_text.push('\n');
            }
        }
    }
    let rust: Vec<&String> =
        files.iter().filter(|f| f.ends_with(".rs") && !covered.contains(*f)).collect();
    for f in rust {
        let Ok(text) = std::fs::read_to_string(root.join(f)) else { continue };
        let body = rust_outline(&text);
        outline_text.push_str(&format!("### {}\n{}\n", f, body));
        covered.insert(f.clone());
    }
    if !outline_text.is_empty() {
        let header = "## Code outline\n\nOne entry per source file: `imports:` lists its local \
                      imports (real dependency edges), then its exported components, functions, \
                      types and — for Rust — items, with `[command]` marking Tauri commands.\n\n";
        // The outline is the most useful thing here after the tree, so it may
        // take whatever is left; only what does not fit is cut, at a file break.
        let room = budget.saturating_sub(out.len() + header.len() + 64);
        out.push_str(header);
        if outline_text.len() <= room {
            out.push_str(&outline_text);
        } else {
            truncated = true;
            // Back off to a char boundary first: paths and signatures can be
            // non-ASCII, and slicing mid-character panics.
            let mut end = room.min(outline_text.len());
            while !outline_text.is_char_boundary(end) {
                end -= 1;
            }
            let cut = outline_text[..end].rfind("\n### ").unwrap_or(0);
            out.push_str(&outline_text[..cut]);
            out.push_str("\n… [outline clipped — the remaining files are in the tree above]\n");
        }
        out.push('\n');
    }

    // --- entry points the outline does not already describe ---
    let entries: Vec<String> =
        entry_points(&files).into_iter().filter(|e| !covered.contains(e)).collect();
    if !entries.is_empty() {
        out.push_str("## Likely entry points\n\n");
        for e in &entries {
            let Some(head) = head_lines(&root.join(e), ENTRY_LINES) else { continue };
            let section = format!("### {}\n\n```\n{}\n```\n\n", e, head);
            if !fits(&out, section.len()) {
                truncated = true;
                break;
            }
            out.push_str(&section);
        }
    }

    // --- every file the outline does not name, last: the cheapest to
    // reconstruct from the tree ---
    let rest: Vec<&String> = files.iter().filter(|f| !covered.contains(*f)).collect();
    let heading = if covered.is_empty() { "## All files" } else { "## Other files" };
    if rest.is_empty() {
        // Everything is in the outline already.
    } else if rest.len() <= MAX_FILES_LISTED {
        let list = rest.iter().map(|s| s.as_str()).collect::<Vec<_>>().join("\n");
        if fits(&out, list.len() + 32) {
            out.push_str(&format!("{}\n\n", heading));
            out.push_str(&list);
            out.push('\n');
        } else {
            truncated = true;
        }
    } else {
        truncated = true;
        out.push_str(&format!(
            "{}\n\n({} files — too many to list; use the tree above and Glob.)\n",
            heading,
            rest.len()
        ));
    }

    Ok(ProjectDigest {
        chars: out.len(),
        digest: out,
        truncated,
        file_count: files.len(),
        dir_count,
        branch,
        outlined_files: covered.len(),
    })
}

/// Cheap probe for the source picker. Never fails — an unusable folder comes
/// back as `available: false` with a reason.
#[tauri::command]
pub async fn project_summary(project_path: String) -> ProjectSummary {
    let root = Path::new(&project_path);
    if !root.is_dir() {
        return ProjectSummary {
            available: false,
            reason: Some("No project folder open.".to_string()),
            file_count: 0,
            dir_count: 0,
            branch: None,
        };
    }
    let files = list_files(root);
    let dirs: HashSet<&str> = files.iter().map(|f| parent_dir(f)).collect();
    ProjectSummary {
        available: !files.is_empty(),
        reason: if files.is_empty() {
            Some("This folder has no source files to diagram.".to_string())
        } else {
            None
        },
        file_count: files.len(),
        dir_count: dirs.len(),
        branch: branch_of(root),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("lirah-project-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src/api")).unwrap();
        std::fs::create_dir_all(dir.join("node_modules/dep")).unwrap();
        std::fs::write(dir.join("src/main.rs"), "fn main() {}\n").unwrap();
        std::fs::write(dir.join("src/api/routes.rs"), "pub fn routes() {}\n").unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname = \"demo\"\n").unwrap();
        std::fs::write(dir.join("README.md"), "# Demo\nA solver.\n").unwrap();
        std::fs::write(dir.join("logo.png"), [0u8; 4]).unwrap();
        std::fs::write(dir.join("node_modules/dep/index.js"), "x").unwrap();
        dir
    }

    #[test]
    fn digest_has_tree_docs_manifests_and_entry_points() {
        let dir = scratch("digest");
        let d = tauri::async_runtime::block_on(build_project_digest(
            dir.to_string_lossy().to_string(),
            None,
            None,
        ))
        .unwrap();
        assert_eq!(d.file_count, 4, "{}", d.digest);
        assert!(d.digest.contains("src/api/"), "tree missing");
        assert!(d.digest.contains("### README.md"), "docs missing");
        assert!(d.digest.contains("### Cargo.toml"), "manifest missing");
        assert!(d.digest.contains("### src/main.rs"), "rust file missing from the outline");
        assert!(!d.digest.contains("node_modules"), "dependency folder leaked");
        assert!(!d.digest.contains("logo.png"), "binary leaked");
        assert!(!d.truncated);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_clipped_doc_flags_truncation_and_the_tree_survives() {
        let dir = scratch("clipped");
        std::fs::write(dir.join("README.md"), "word ".repeat(10_000)).unwrap();
        let d = tauri::async_runtime::block_on(build_project_digest(
            dir.to_string_lossy().to_string(),
            None,
            None,
        ))
        .unwrap();
        assert!(d.digest.contains("## Directory tree"));
        assert!(d.digest.contains("… [clipped]"));
        assert!(d.truncated);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rust_outline_keeps_items_imports_and_commands_but_not_tests() {
        let src = "use crate::design::spec;\nuse std::path::Path;\n\n#[tauri::command]\npub async fn run(x: u8) -> u8 {\n    x\n}\n\nstruct Inner { a: u8 }\n\nimpl Inner {\n    pub fn get(&self) -> u8 { self.a }\n}\n\n#[cfg(test)]\nmod tests {\n    fn hidden() {}\n}\n";
        let o = rust_outline(src);
        assert!(o.starts_with("imports: crate::design::spec"), "{}", o);
        assert!(!o.contains("std::path"), "external import leaked: {}", o);
        assert!(o.contains("[command] pub async fn run(x: u8) -> u8"), "{}", o);
        assert!(o.contains("struct Inner"), "{}", o);
        assert!(o.contains("pub fn get(&self) -> u8"), "{}", o);
        assert!(!o.contains("hidden"), "test code leaked: {}", o);
    }

    #[test]
    fn a_passed_outline_replaces_entry_heads_and_the_file_list_for_its_files() {
        let dir = scratch("outline");
        std::fs::write(dir.join("src/app.js"), "export function boot() {}\n").unwrap();
        let outline = "## src/app.js\nfn: boot()+:1".to_string();
        let d = tauri::async_runtime::block_on(build_project_digest(
            dir.to_string_lossy().to_string(),
            None,
            Some(outline),
        ))
        .unwrap();
        assert!(d.digest.contains("## Code outline"));
        assert!(d.digest.contains("### src/app.js\nfn: boot()+:1"), "{}", d.digest);
        // src/app.js, src/main.rs, src/api/routes.rs are outlined; only the
        // non-source files are left to list.
        assert_eq!(d.outlined_files, 3, "{}", d.digest);
        assert!(d.digest.contains("## Other files"));
        let other = d.digest.split("## Other files").nth(1).unwrap();
        assert!(!other.contains("src/app.js") && other.contains("README.md"), "{}", other);
        assert!(!d.digest.contains("## Likely entry points"), "outlined entry points repeated");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn summary_reports_an_empty_folder_as_unavailable() {
        let dir = std::env::temp_dir().join(format!("lirah-project-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let s = tauri::async_runtime::block_on(project_summary(dir.to_string_lossy().to_string()));
        assert!(!s.available);
        assert!(s.reason.is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
