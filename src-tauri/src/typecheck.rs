use serde::Serialize;
use std::path::Path;
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

/// Parse tsc output into structured errors
/// Format: file.ts(123,45): error TS2322: Type 'string' is not assignable to type 'number'.
fn parse_tsc_output(output: &str) -> Vec<TypeCheckError> {
    let mut errors = Vec::new();

    for line in output.lines() {
        // Parse format: file.ts(123,45): error TS2322: Message
        if let Some(paren_start) = line.find('(') {
            if let Some(paren_end) = line.find("): ") {
                let coords = &line[paren_start + 1..paren_end];
                let rest = &line[paren_end + 3..];

                // Parse line,column
                if let Some(comma) = coords.find(',') {
                    let line_num = coords[..comma].parse::<usize>().ok();
                    let col_num = coords[comma + 1..].parse::<usize>().ok();

                    if let (Some(line), Some(column)) = (line_num, col_num) {
                        // Parse severity and code
                        let parts: Vec<&str> = rest.splitn(3, ' ').collect();
                        if parts.len() >= 3 {
                            let severity = parts[0].to_string();
                            let code = parts[1].trim_end_matches(':').to_string();
                            let message = parts[2].to_string();

                            errors.push(TypeCheckError {
                                line,
                                column,
                                code,
                                message,
                                severity,
                            });
                        }
                    }
                }
            }
        }
    }

    errors
}

/// Main Tauri command to check TypeScript types for a file
#[tauri::command]
pub fn check_file_types(
    file_path: String,
    #[allow(unused_variables)]
    project_root: Option<String>,  // Kept for API compatibility, not used
) -> Result<TypeCheckResult, String> {
    let start_time = Instant::now();

    // Validate file extension
    let path = Path::new(&file_path);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let is_valid = matches!(
        extension.to_lowercase().as_str(),
        "ts" | "tsx" | "js" | "jsx"
    );

    if !is_valid {
        return Err(format!(
            "Invalid file type. Only .ts, .tsx, .js, and .jsx files are supported. Got: .{}",
            extension
        ));
    }

    // Check if file exists
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Build and execute tsc command
    // TypeScript will automatically find tsconfig.json up the directory tree
    let mut cmd = get_tsc_command(&file_path);

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "TypeScript compiler not found. Please install: npm install -g typescript".to_string()
        } else {
            format!("Failed to execute tsc: {}", e)
        }
    })?;

    // Parse output
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined_output = format!("{}\n{}", stdout, stderr);

    let errors = parse_tsc_output(&combined_output);

    // Count errors and warnings
    let error_count = errors.iter().filter(|e| e.severity == "error").count();
    let warning_count = errors.iter().filter(|e| e.severity == "warning").count();

    let execution_time_ms = start_time.elapsed().as_millis();

    Ok(TypeCheckResult {
        file_path: file_path.clone(),
        error_count,
        warning_count,
        errors,
        success: error_count == 0 && warning_count == 0,
        execution_time_ms,
    })
}
