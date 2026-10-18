mod state;
mod pty;
mod fs;
mod git_cache;
mod directory_cache;
mod ignore_dirs;
mod typecheck;
mod python_parser;
mod commit_watcher;
mod claude;
mod workspace;
mod fs_watcher;
mod agent_runner;
mod ipc;
mod watch_registry;
mod agent_hooks;

use tauri::Manager;

use state::create_state;
use pty::commands::{spawn_terminal, attach_terminal, reap_detached_terminals, detach_all_terminals, write_to_terminal, resize_terminal, close_terminal, pty_pause, pty_resume, spawn_hidden_terminal, start_commit_watcher, stop_commit_watcher, get_committable_files, run_git_command, generate_commit_message, check_pty_child_process, kill_pty_child_process};
use fs::{read_directory, get_terminal_cwd, read_file_content, write_file_content, read_directory_recursive, get_git_stats, get_current_branch, enable_file_watchers, disable_file_watchers, get_file_watchers_status, check_command_exists, get_git_diff, get_session_token_usage, get_project_stats, get_all_projects_stats, get_home_dir, set_file_executable, path_exists};
use typecheck::{check_file_types, check_project_types};
use python_parser::parse_python_skeleton;
use claude::{get_active_claude_session, get_project_subagents, watch_project_subagents, stop_project_subagents_watcher, SubagentWatcherStore};
use workspace::{create_workspace, delete_workspace, list_workspaces, open_workspace, close_workspace};
use fs_watcher::{start_fs_watcher, stop_fs_watcher, FsWatcherStore};
use agent_runner::{create_agent_job_store};
use agent_runner::commands::{run_agent_job, cancel_agent_job, list_running_agent_jobs};

pub struct InitialPath(pub Option<String>);

#[tauri::command]
fn get_initial_path(state: tauri::State<InitialPath>) -> Option<String> {
    state.0.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(initial_path: Option<String>) {
    // Disable GTK overlay scrolling to prevent scrollbars resizing on hover
    #[cfg(target_os = "linux")]
    std::env::set_var("GTK_OVERLAY_SCROLLING", "0");

    ipc::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(create_state())
        .manage(commit_watcher::create_commit_watcher_store())
        .manage(std::sync::Arc::new(FsWatcherStore::new()))
        .manage(std::sync::Arc::new(SubagentWatcherStore::new()))
        .manage(create_agent_job_store())
        .manage(InitialPath(initial_path))
        .setup(|app| {
            agent_hooks::start(app.handle().clone());
            Ok(())
        })
        // A reload (Ctrl+R, a dev HMR full reload) runs no frontend cleanup, so
        // terminals outlive the page. Detach them here; the new page reattaches
        // the ones it still has tabs for and reaps the rest.
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                if let Some(state) = webview.try_state::<state::AppState>() {
                    detach_all_terminals(&state);
                }
            }
        })
        .invoke_handler(ipc::wrap(tauri::generate_handler![
            spawn_terminal,
            attach_terminal,
            reap_detached_terminals,
            write_to_terminal,
            resize_terminal,
            close_terminal,
            pty_pause,
            pty_resume,
            read_directory,
            get_terminal_cwd,
            read_file_content,
            write_file_content,
            read_directory_recursive,
            get_git_stats,
            check_file_types,
            check_project_types,
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
            get_active_claude_session,
            get_project_subagents,
            watch_project_subagents,
            stop_project_subagents_watcher,
            create_workspace,
            delete_workspace,
            list_workspaces,
            open_workspace,
            close_workspace,
            get_home_dir,
            set_file_executable,
            path_exists,
            check_pty_child_process,
            kill_pty_child_process,
            start_fs_watcher,
            stop_fs_watcher,
            run_agent_job,
            cancel_agent_job,
            list_running_agent_jobs,
            get_initial_path,
            agent_hooks::get_agent_hook_plugin_dir
        ]))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
