pub mod directory;
mod cwd;
mod git;
mod commands;
mod git_commands;

pub use directory::{read_directory, read_file_content, write_file_content, read_directory_recursive};
pub use cwd::get_terminal_cwd;
pub use git::{GitStats, get_git_stats, get_git_diff, get_current_branch, enable_file_watchers, disable_file_watchers, get_file_watchers_status};
pub(crate) use git::{resolve_git_dir, read_current_branch};
pub use commands::{check_command_exists, get_home_dir, set_file_executable, path_exists};
pub use git_commands::{get_committable_files, run_git_command, generate_commit_message};
