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

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".into())
}

#[tauri::command]
pub fn set_file_executable(path: String) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set executable: {}", e))
    }
    #[cfg(not(unix))]
    Ok(())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}
