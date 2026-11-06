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
mod fs_watcher;
mod agent_runner;
mod ipc;
mod watch_registry;
mod agent_hooks;
mod agent_control;
mod plans;
mod util;
mod compaction;
mod user_plugins;
mod persistence;

use tauri::Manager;

use state::create_state;
use claude::SubagentWatcherStore;
use fs_watcher::FsWatcherStore;

pub struct InitialPath(pub Option<String>);

fn env_nonempty(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

/// Promo recordings run with their own webview profile (`LIRAH_PROFILE`, a
/// folder holding localStorage) so demo tabs never touch the user's own.
fn recording_profile() -> Option<std::path::PathBuf> {
    env_nonempty("LIRAH_PROFILE").map(std::path::PathBuf::from)
}

#[derive(serde::Serialize)]
struct RecordingMode {
    /// A theme forced for this run by `LIRAH_THEME`; shown, never saved.
    theme: Option<String>,
    /// Running on a recording profile: desktop notifications stay quiet.
    quiet: bool,
}

#[tauri::command]
fn get_recording_mode() -> RecordingMode {
    RecordingMode { theme: env_nonempty("LIRAH_THEME"), quiet: recording_profile().is_some() }
}

#[tauri::command]
fn get_initial_path(state: tauri::State<InitialPath>) -> Option<String> {
    state.0.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(initial_path: Option<String>) {
    // Disable GTK overlay scrolling to prevent scrollbars resizing on hover
    #[cfg(target_os = "linux")]
    std::env::set_var("GTK_OVERLAY_SCROLLING", "0");

    // With IBus active (GNOME/Ubuntu default) WebKitGTK delivers every keystroke
    // as a composition, and xterm.js mangles it — keys arrive quoted ('a'e'…)
    // and dead-key layouts break. GTK's built-in IM context still handles dead
    // keys and compose. An explicit GTK_IM_MODULE (fcitx, ibus for CJK) wins.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GTK_IM_MODULE").is_none() {
        std::env::set_var("GTK_IM_MODULE", "gtk-im-context-simple");
        util::FORCED_SIMPLE_IM.store(true, std::sync::atomic::Ordering::Relaxed);
    }

    ipc::init();

    // Recordings run on a bare X display with no window manager to size the
    // window, so they ask for an exact size: LIRAH_WINDOW_SIZE=1280x800.
    let forced_size = env_nonempty("LIRAH_WINDOW_SIZE").and_then(|s| parse_window_size(&s));
    // Registered before the window is built (in `setup`) so it restores the
    // saved state. VISIBLE is left out: the page shows the window once painted.
    // A forced size wins over the saved state, so the window is skipped then.
    let mut window_state = tauri_plugin_window_state::Builder::default().with_state_flags(
        tauri_plugin_window_state::StateFlags::SIZE
            | tauri_plugin_window_state::StateFlags::POSITION
            | tauri_plugin_window_state::StateFlags::MAXIMIZED,
    );
    if forced_size.is_some() {
        window_state = window_state.with_denylist(&["main"]);
    }

    tauri::Builder::default()
        .plugin(window_state.build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(create_state())
        .manage(commit_watcher::create_commit_watcher_store())
        .manage(std::sync::Arc::new(FsWatcherStore::new()))
        .manage(std::sync::Arc::new(SubagentWatcherStore::new()))
        .manage(agent_runner::create_agent_job_store())
        .manage(InitialPath(initial_path))
        .setup(move |app| {
            // The main window is built here rather than from the config so a
            // recording can give it its own profile folder.
            let config = app.config().app.windows.iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("no main window in tauri.conf.json")?;
            let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            if let Some(dir) = recording_profile() {
                window = window.data_directory(dir);
            }
            if let Some((w, h)) = forced_size {
                window = window.inner_size(w, h);
            }
            window.build()?;

            agent_hooks::start(app.handle().clone());
            agent_control::start(app.handle().clone());
            compaction::start();
            // The window starts hidden and the page shows it once its splash
            // has painted. If the page never gets that far, show it anyway.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
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
            pty::commands::detect_pty_clis,
            pty::commands::kill_pty_child_process,
            pty::manager::get_sandbox_spec,
            fs::cwd::get_terminal_cwd,
            get_initial_path,
            get_recording_mode,
            // Files
            fs::directory::read_directory,
            fs::directory::read_file_content,
            fs::directory::write_file_content,
            persistence::read_persisted,
            persistence::write_persisted,
            persistence::backup_persisted,
            persistence::start_persistence_watcher,
            fs::directory::read_directory_recursive,
            fs::commands::get_home_dir,
            fs::commands::get_shell_kind,
            fs::commands::set_file_executable,
            fs::commands::path_exists,
            fs::commands::check_command_exists,
            fs::commands::open_in_file_manager,
            fs::git::enable_file_watchers,
            fs::git::disable_file_watchers,
            fs::git::get_file_watchers_status,
            fs_watcher::start_fs_watcher,
            fs_watcher::stop_fs_watcher,
            // Code
            typecheck::check_file_types,
            typecheck::check_project_types,
            python_parser::parse_python_skeleton,
            compaction::get_compaction_plugin_dir,
            compaction::set_compaction_hook,
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
            claude::context::get_context_breakdown,
            agent_hooks::get_agent_hook_plugin_dir,
            agent_hooks::get_agent_control_plugin_dir,
            user_plugins::install_user_plugin,
            agent_hooks::set_opencode_agent_plugin,
            agent_hooks::set_prompt_context,
            agent_control::agent_control_reply,
            // Agent jobs
            agent_runner::commands::run_agent_job,
            agent_runner::commands::cancel_agent_job,
            agent_runner::commands::list_running_agent_jobs,
            // Plans
            plans::split_plan,
            plans::format_task,
            plans::delete_plan_file,
            plans::remove_plan_workdir,
            plans::last_assistant_text,
        ]))
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                agent_control::stop();
            }
        });
}

/// "1280x800" -> (1280.0, 800.0); None if it is not two numbers around an `x`.
fn parse_window_size(s: &str) -> Option<(f64, f64)> {
    let (w, h) = s.split_once('x')?;
    Some((w.parse().ok()?, h.parse().ok()?))
}

#[cfg(test)]
mod window_size_tests {
    use super::parse_window_size;

    #[test]
    fn parses_width_by_height() {
        assert_eq!(parse_window_size("1280x800"), Some((1280.0, 800.0)));
    }

    #[test]
    fn rejects_malformed_sizes() {
        for bad in ["", "1280", "1280x", "x800", "axb", "1280X800"] {
            assert_eq!(parse_window_size(bad), None, "{bad}");
        }
    }
}
