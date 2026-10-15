use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

#[derive(Serialize, Clone, Debug)]
pub struct TypeCheckError {
    pub line: usize,
    pub column: usize,
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct TypeCheckResult {
    pub file_path: String,
    pub error_count: usize,
    pub warning_count: usize,
    pub errors: Vec<TypeCheckError>,
    pub success: bool,
    pub execution_time_ms: u128,
}

/// Build the tsc command to check a single file
/// TypeScript will automatically find and use tsconfig.json if present
fn get_tsc_command(file_path: &str) -> Command {
    #[cfg(target_os = "windows")]
    let tsc_cmd = "tsc.cmd";
    #[cfg(not(target_os = "windows"))]
    let tsc_cmd = "tsc";

    let mut cmd = Command::new(tsc_cmd);
    cmd.arg("--noEmit");
    cmd.arg("--skipLibCheck");  // Performance optimization
    cmd.arg("--jsx").arg("react-jsx");  // Support JSX syntax
    cmd.arg(file_path);
    cmd
}

/// Parse one tsc diagnostic line into (file, error).
/// Format: file.ts(123,45): error TS2322: Type 'string' is not assignable to type 'number'.
/// The location is the last "(" before the first "): ", so a path containing
/// parentheses still parses.
fn parse_tsc_line(line: &str) -> Option<(&str, TypeCheckError)> {
    let paren_end = line.find("): ")?;
    let paren_start = line[..paren_end].rfind('(')?;
    let file = &line[..paren_start];
    let coords = &line[paren_start + 1..paren_end];
    let rest = &line[paren_end + 3..];

    let (line_num, col_num) = coords.split_once(',')?;
    let line_num = line_num.parse::<usize>().ok()?;
    let col_num = col_num.parse::<usize>().ok()?;

    // Parse severity and code
    let parts: Vec<&str> = rest.splitn(3, ' ').collect();
    if parts.len() < 3 {
        return None;
    }
    Some((
        file,
        TypeCheckError {
            line: line_num,
            column: col_num,
            code: parts[1].trim_end_matches(':').to_string(),
            message: parts[2].to_string(),
            severity: parts[0].to_string(),
        },
    ))
}

/// Parse tsc output into structured errors
fn parse_tsc_output(output: &str) -> Vec<TypeCheckError> {
    output
        .lines()
        .filter_map(parse_tsc_line)
        .map(|(_, error)| error)
        .collect()
}

fn build_result(file_path: String, errors: Vec<TypeCheckError>, execution_time_ms: u128) -> TypeCheckResult {
    let error_count = errors.iter().filter(|e| e.severity == "error").count();
    let warning_count = errors.iter().filter(|e| e.severity == "warning").count();
    TypeCheckResult {
        file_path,
        error_count,
        warning_count,
        errors,
        success: error_count == 0 && warning_count == 0,
        execution_time_ms,
    }
}

fn is_checkable(path: &Path) -> bool {
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    matches!(
        extension.to_lowercase().as_str(),
        "ts" | "tsx" | "js" | "jsx" | "mts" | "cts"
    )
}

fn tsc_not_found(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        "TypeScript compiler not found. Please install: npm install -g typescript".to_string()
    } else {
        format!("Failed to execute tsc: {}", e)
    }
}

/// Main Tauri command to check TypeScript types for a file
#[tauri::command]
pub async fn check_file_types(
    file_path: String,
    #[allow(unused_variables)]
    project_root: Option<String>,  // Kept for API compatibility, not used
) -> Result<TypeCheckResult, String> {
    crate::ipc::blocking("check_file_types", move || check_single_file(file_path)).await
}

/// Check one file by passing it to tsc directly (tsconfig.json is not applied).
fn check_single_file(file_path: String) -> Result<TypeCheckResult, String> {
    let start_time = Instant::now();

    // Validate file extension
    let path = Path::new(&file_path);
    if !is_checkable(path) {
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        return Err(format!(
            "Invalid file type. Only .ts, .tsx, .js, and .jsx files are supported. Got: .{}",
            extension
        ));
    }

    // Check if file exists
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let output = get_tsc_command(&file_path).output().map_err(tsc_not_found)?;

    // Parse output
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined_output = format!("{}\n{}", stdout, stderr);

    let errors = parse_tsc_output(&combined_output);
    Ok(build_result(file_path, errors, start_time.elapsed().as_millis()))
}

/// Nearest tsconfig.json at or above `dir`, not looking above `stop` (when
/// `dir` is inside it).
fn find_tsconfig(dir: &Path, stop: &Path) -> Option<PathBuf> {
    let mut current = Some(dir);
    while let Some(d) = current {
        let candidate = d.join("tsconfig.json");
        if candidate.is_file() {
            return Some(candidate);
        }
        if d == stop {
            return None;
        }
        current = d.parent();
    }
    None
}

/// The project's own tsc (node_modules/.bin) when there is one, else the global.
fn tsc_binary(from: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    let name = "tsc.cmd";
    #[cfg(not(target_os = "windows"))]
    let name = "tsc";
    from.ancestors()
        .map(|d| d.join("node_modules").join(".bin").join(name))
        .find(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from(name))
}

fn normalize(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// What one `tsc -p` run produced for a group of files.
struct ProjectRun {
    /// Results for the files that are part of the tsconfig's program.
    results: HashMap<String, TypeCheckResult>,
    /// Files the tsconfig does not include; they need a per-file check.
    outside: Vec<String>,
}

/// Run one `tsc --noEmit -p <tsconfig>` and keep the diagnostics of `files`
/// (keyed by their normalized path). None when tsc failed without reporting
/// any located diagnostic (broken config, ...), so the caller can fall back to
/// per-file checks.
fn check_with_tsconfig(
    tsconfig: &Path,
    files: &HashMap<PathBuf, String>,
) -> Result<Option<ProjectRun>, String> {
    let start_time = Instant::now();
    let config_dir = tsconfig.parent().unwrap_or(Path::new("."));
    let output = Command::new(tsc_binary(config_dir))
        .arg("--noEmit")
        .arg("--pretty")
        .arg("false")
        // Also print every file in the program, to tell which of `files` the
        // tsconfig actually covers.
        .arg("--listFiles")
        .arg("-p")
        .arg(tsconfig)
        .current_dir(config_dir)
        .output()
        .map_err(tsc_not_found)?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let mut by_file: HashMap<String, Vec<TypeCheckError>> = HashMap::new();
    let mut in_program: Vec<&String> = Vec::new();
    let mut located = 0usize;
    for line in stdout.lines().chain(stderr.lines()) {
        if let Some((file, error)) = parse_tsc_line(line) {
            located += 1;
            // tsc prints diagnostic paths relative to its working directory.
            let path = normalize(&config_dir.join(file));
            if let Some(original) = files.get(&path) {
                by_file.entry(original.clone()).or_default().push(error);
            }
        } else if let Some(original) = files.get(&normalize(&config_dir.join(line.trim()))) {
            // A --listFiles line (absolute path).
            in_program.push(original);
        }
    }

    if !output.status.success() && located == 0 {
        return Ok(None);
    }

    let elapsed = start_time.elapsed().as_millis();
    let mut run = ProjectRun {
        results: HashMap::new(),
        outside: Vec::new(),
    };
    for original in files.values() {
        if in_program.contains(&original) {
            let errors = by_file.remove(original).unwrap_or_default();
            run.results
                .insert(original.clone(), build_result(original.clone(), errors, elapsed));
        } else {
            run.outside.push(original.clone());
        }
    }
    Ok(Some(run))
}

fn check_project_blocking(
    project_path: String,
    files: Vec<String>,
) -> Result<HashMap<String, TypeCheckResult>, String> {
    let project = Path::new(&project_path);
    let mut results: HashMap<String, TypeCheckResult> = HashMap::new();

    // Group the checkable files by their nearest tsconfig.json.
    let mut groups: HashMap<PathBuf, HashMap<PathBuf, String>> = HashMap::new();
    let mut loose: Vec<String> = Vec::new();
    for original in files {
        let path = project.join(&original);
        if !is_checkable(&path) || !path.is_file() {
            continue;
        }
        let dir = path.parent().unwrap_or(project);
        match find_tsconfig(dir, project) {
            Some(tsconfig) => {
                groups
                    .entry(tsconfig)
                    .or_default()
                    .insert(normalize(&path), original);
            }
            None => loose.push(original),
        }
    }

    for (tsconfig, group) in groups {
        match check_with_tsconfig(&tsconfig, &group)? {
            Some(run) => {
                results.extend(run.results);
                loose.extend(run.outside);
            }
            None => loose.extend(group.into_values()),
        }
    }

    // No usable tsconfig: the old per-file check.
    for original in loose {
        let path = project.join(&original).to_string_lossy().to_string();
        if let Ok(mut result) = check_single_file(path) {
            result.file_path = original.clone();
            results.insert(original, result);
        }
    }

    Ok(results)
}

/// Type-check a set of files with one `tsc -p` per tsconfig.json (normally a
/// single run), honoring the project's compiler options, and return the
/// diagnostics of just those files.
///
/// Returns a map keyed by each path exactly as given in `files` (absolute, or
/// relative to `project_path`), with the same `TypeCheckResult` shape as
/// `check_file_types`; `execution_time_ms` is the duration of the shared run.
/// Files that are not .ts/.tsx/.js/.jsx/.mts/.cts or do not exist are left out.
/// Files with no tsconfig.json between them and `project_path`, files their
/// tsconfig does not include, and files whose tsconfig run fails outright are
/// checked one by one as `check_file_types` does. Errs only when tsc cannot be
/// run at all.
#[tauri::command]
pub async fn check_project_types(
    project_path: String,
    files: Vec<String>,
) -> Result<HashMap<String, TypeCheckResult>, String> {
    crate::ipc::blocking("check_project_types", move || {
        check_project_blocking(project_path, files)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_location_and_file() {
        let (file, e) =
            parse_tsc_line("src/a (copy).ts(12,5): error TS2322: Type 'x' is not assignable.").unwrap();
        assert_eq!(file, "src/a (copy).ts");
        assert_eq!((e.line, e.column), (12, 5));
        assert_eq!(e.code, "TS2322");
        assert_eq!(e.severity, "error");
        assert_eq!(e.message, "Type 'x' is not assignable.");
        assert!(parse_tsc_line("error TS5083: Cannot read file 'tsconfig.json'.").is_none());
    }

    #[test]
    fn nearest_tsconfig_stops_at_project() {
        let root = std::env::temp_dir().join(format!("nevo-tsc-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("proj/pkg/src")).unwrap();
        std::fs::write(root.join("tsconfig.json"), "{}").unwrap();
        std::fs::write(root.join("proj/pkg/tsconfig.json"), "{}").unwrap();
        assert_eq!(
            find_tsconfig(&root.join("proj/pkg/src"), &root.join("proj")),
            Some(root.join("proj/pkg/tsconfig.json"))
        );
        std::fs::remove_file(root.join("proj/pkg/tsconfig.json")).unwrap();
        assert_eq!(find_tsconfig(&root.join("proj/pkg/src"), &root.join("proj")), None);
        let _ = std::fs::remove_dir_all(&root);
    }
}
