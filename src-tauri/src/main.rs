// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let initial_path = std::env::args().nth(1).and_then(|p| {
        let path = std::path::Path::new(&p);
        if path.is_dir() {
            Some(std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()).to_string_lossy().into_owned())
        } else {
            eprintln!("Warning: '{}' is not a valid directory, ignoring", p);
            None
        }
    });
    nevo_terminal_lib::run(initial_path)
}
