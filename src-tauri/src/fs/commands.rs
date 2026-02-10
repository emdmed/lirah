use std::process::Command;

#[tauri::command]
pub fn check_command_exists(command: String) -> Result<bool, String> {
    #[cfg(target_family = "unix")]
    let checker = "which";

    #[cfg(target_family = "windows")]
    let checker = "where";

    let output = Command::new(checker)
        .arg(&command)
        .output()
        .map_err(|e| format!("Failed to check command: {}", e))?;

    Ok(output.status.success())
}
