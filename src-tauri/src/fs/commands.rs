#[tauri::command]
pub async fn check_command_exists(command: String) -> Result<bool, String> {
    crate::ipc::blocking("check_command_exists", move || {
        #[cfg(target_family = "unix")]
        let checker = "which";

        #[cfg(target_family = "windows")]
        let checker = "where";

        let output = crate::util::hidden_command(checker)
            .arg(&command)
            .output()
            .map_err(|e| format!("Failed to check command: {}", e))?;

        Ok(output.status.success())
    })
    .await
}

/// The kind of shell the terminal runs, so the frontend can quote for it.
#[tauri::command]
pub fn get_shell_kind() -> &'static str {
    crate::util::shell_kind()
}

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    crate::util::home_dir_string()
        .ok_or_else(|| "Could not determine home directory".into())
}

#[tauri::command]
pub async fn set_file_executable(path: String) -> Result<(), String> {
    crate::ipc::blocking("set_file_executable", move || {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&path, perms)
                .map_err(|e| format!("Failed to set executable: {}", e))
        }
        #[cfg(not(unix))]
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub async fn open_in_file_manager(path: String) -> Result<(), String> {
    crate::ipc::blocking("open_in_file_manager", move || {
        let p = std::fs::canonicalize(&path)
            .map_err(|e| format!("Cannot open {}: {}", path, e))?;
        if !p.is_dir() {
            return Err(format!("Not a folder: {}", p.display()));
        }
        tauri_plugin_opener::open_path(&p, None::<&str>)
            .map_err(|e| format!("Could not open file manager: {}", e))
    })
    .await
}
