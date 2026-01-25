mod state;
mod pty;
mod fs;
mod git_cache;
mod typecheck;

use state::create_state;
use pty::commands::{spawn_terminal, write_to_terminal, resize_terminal, close_terminal};
use fs::{read_directory, get_terminal_cwd, read_file_content, read_directory_recursive, get_git_stats, enable_file_watchers, disable_file_watchers, get_file_watchers_status, check_command_exists, get_git_diff};
use typecheck::check_file_types;

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
            read_file_content,
            read_directory_recursive,
            get_git_stats,
            check_file_types,
            enable_file_watchers,
            disable_file_watchers,
            get_file_watchers_status,
            check_command_exists,
            get_git_diff
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
