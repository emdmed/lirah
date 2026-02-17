mod directory;
mod cwd;
mod git;
mod tokens;
mod commands;

pub use directory::{read_directory, read_file_content, read_directory_recursive};
pub use cwd::get_terminal_cwd;
pub use git::{GitStats, get_git_stats, get_git_diff, get_current_branch, enable_file_watchers, disable_file_watchers, get_file_watchers_status};
pub use tokens::{get_session_token_usage, get_project_stats, get_all_projects_stats};
pub use commands::check_command_exists;

fn home_dir() -> Option<String> {
    #[cfg(unix)]
    { std::env::var("HOME").ok() }
    #[cfg(windows)]
    { std::env::var("USERPROFILE").ok() }
}
