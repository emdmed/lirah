mod state;
mod pty;
mod fs;

use state::create_state;
use pty::commands::{spawn_terminal, write_to_terminal, resize_terminal, close_terminal};
use fs::{read_directory, get_terminal_cwd, detect_claude_env};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(create_state())
        .invoke_handler(tauri::generate_handler![
            spawn_terminal,
            write_to_terminal,
            resize_terminal,
            close_terminal,
            read_directory,
            get_terminal_cwd,
            detect_claude_env
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
