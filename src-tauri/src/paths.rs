//! The app's one path form: `/` separators, uppercase drive letter, no `\\?\`
//! prefix, no trailing slash. Mirrors `normalizePath` in `src/utils/pathUtils.js`.
//! Paths sent to the frontend go through `to_app`; `canonicalize` goes through
//! `canonical` (both enforced by `npm run check:paths`).

use std::io;
use std::path::{Path, PathBuf};

/// Like `fs::canonicalize` but without the Windows `\\?\` prefix.
pub fn canonical(p: &Path) -> io::Result<PathBuf> {
    dunce::canonicalize(p)
}

/// A path in the form the frontend expects.
pub fn to_app(p: &Path) -> String {
    let s = dunce::simplified(p).to_string_lossy().into_owned();
    // On unix `\` is a legal filename character, so only Windows rewrites it.
    if cfg!(windows) { app_form(&s) } else { s }
}

fn app_form(s: &str) -> String {
    let mut s = s.replace('\\', "/");
    if let Some(rest) = s.strip_prefix("//?/UNC/") {
        s = format!("//{rest}");
    } else if let Some(rest) = s.strip_prefix("//?/") {
        s = rest.to_string();
    }
    let b = s.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_lowercase() && b[1] == b':' {
        s[..1].make_ascii_uppercase();
    }
    s.trim_end_matches('/').to_string()
}

#[cfg(test)]
#[path = "paths_tests.rs"]
mod tests;
