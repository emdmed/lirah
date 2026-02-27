mod state;
mod pty;
mod fs;
mod git_cache;
mod typecheck;
mod python_parser;
mod commit_watcher;
mod instance_sync;

use state::create_state;
use pty::commands::{spawn_terminal, write_to_terminal, resize_terminal, close_terminal, spawn_hidden_terminal, start_commit_watcher, stop_commit_watcher, get_committable_files, run_git_command, generate_commit_message, generate_branch_tasks};
use fs::{read_directory, get_terminal_cwd, read_file_content, read_directory_recursive, get_git_stats, get_current_branch, enable_file_watchers, disable_file_watchers, get_file_watchers_status, check_command_exists, get_git_diff, get_session_token_usage, get_project_stats, get_all_projects_stats, get_branch_completed_tasks};
use typecheck::check_file_types;
use python_parser::parse_python_skeleton;
use instance_sync::{create_instance_sync_store, get_instance_id, register_instance, update_instance_state, get_all_instances, get_own_instance_state, unregister_instance, watch_instances_dir};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Disable GTK overlay scrolling to prevent scrollbars resizing on hover
    #[cfg(target_os = "linux")]
    std::env::set_var("GTK_OVERLAY_SCROLLING", "0");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(create_state())
        .manage(commit_watcher::create_commit_watcher_store())
        .manage(create_instance_sync_store())
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
            get_git_diff,
            get_current_branch,
            get_session_token_usage,
            get_project_stats,
            parse_python_skeleton,
            get_all_projects_stats,
            spawn_hidden_terminal,
            start_commit_watcher,
            stop_commit_watcher,
            get_committable_files,
            run_git_command,
            generate_commit_message,
            generate_branch_tasks,
            get_branch_completed_tasks,
            get_instance_id,
            register_instance,
            update_instance_state,
            get_all_instances,
            get_own_instance_state,
            unregister_instance,
            watch_instances_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
