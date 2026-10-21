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
mod plans;
mod util;

use tauri::Manager;

use state::create_state;
use claude::SubagentWatcherStore;
use fs_watcher::FsWatcherStore;

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
        .manage(agent_runner::create_agent_job_store())
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
                    pty::commands::detach_all_terminals(&state);
                }
            }
        })
        .invoke_handler(ipc::wrap(tauri::generate_handler![
            // Terminals
            pty::commands::spawn_terminal,
            pty::commands::attach_terminal,
            pty::commands::reap_detached_terminals,
            pty::commands::write_to_terminal,
            pty::commands::resize_terminal,
            pty::commands::close_terminal,
            pty::commands::pty_pause,
            pty::commands::pty_resume,
            pty::commands::spawn_hidden_terminal,
            pty::commands::check_pty_child_process,
            pty::commands::kill_pty_child_process,
            fs::cwd::get_terminal_cwd,
            get_initial_path,
            // Files
            fs::directory::read_directory,
            fs::directory::read_file_content,
            fs::directory::write_file_content,
            fs::directory::read_directory_recursive,
            fs::commands::get_home_dir,
            fs::commands::set_file_executable,
            fs::commands::path_exists,
            fs::commands::check_command_exists,
            fs::git::enable_file_watchers,
            fs::git::disable_file_watchers,
            fs::git::get_file_watchers_status,
            fs_watcher::start_fs_watcher,
            fs_watcher::stop_fs_watcher,
            // Code
            typecheck::check_file_types,
            typecheck::check_project_types,
            python_parser::parse_python_skeleton,
            // Git
            fs::git::get_git_stats,
            fs::git::get_git_diff,
            fs::git::get_current_branch,
            fs::git_commands::get_committable_files,
            fs::git_commands::run_git_command,
            fs::git_commands::generate_commit_message,
            pty::commands::start_commit_watcher,
            pty::commands::stop_commit_watcher,
            // Claude sessions and tokens
            claude::commands::get_active_claude_session,
            claude::commands::get_project_subagents,
            claude::commands::watch_project_subagents,
            claude::commands::stop_project_subagents_watcher,
            claude::tokens::get_session_token_usage,
            claude::tokens::get_project_stats,
            claude::tokens::get_all_projects_stats,
            agent_hooks::get_agent_hook_plugin_dir,
            // Workspaces
            workspace::create_workspace,
            workspace::delete_workspace,
            workspace::list_workspaces,
            workspace::open_workspace,
            workspace::close_workspace,
            // Agent jobs
            agent_runner::commands::run_agent_job,
            agent_runner::commands::cancel_agent_job,
            agent_runner::commands::list_running_agent_jobs,
            // Plans
            plans::split_plan,
            plans::delete_plan_file,
            plans::remove_plan_workdir,
            plans::last_assistant_text,
        ]))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
