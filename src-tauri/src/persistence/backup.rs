//! Copy of a persisted file taken before a migration rewrites it.

use super::store;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const KEEP_PER_FILE: usize = 3;

/// Copy `path` to `backups/<name>.v<version>.<timestamp>.json` next to it, then
/// drop all but the newest backups of that file. `None` if there is no file yet.
pub fn backup(path: &Path) -> Result<Option<PathBuf>, String> {
    let Some(file) = store::read(path)? else {
        return Ok(None);
    };
    let name = file_name(path)?;
    let dir = path.with_file_name("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;

    let backup = dir.join(format!("{}.v{}.{}.json", name, file.version, timestamp()?));
    fs::copy(path, &backup).map_err(|e| format!("Failed to back up {}: {}", path.display(), e))?;

    prune(&dir, &name)?;
    Ok(Some(backup))
}

/// `tasks.json` -> `tasks`.
fn file_name(path: &Path) -> Result<String, String> {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .ok_or_else(|| format!("{} has no file name", path.display()))
}

/// Milliseconds since the epoch: sorts backups by age and keeps names unique.
fn timestamp() -> Result<u128, String> {
    let since_epoch = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    Ok(since_epoch.as_millis())
}

fn prune(dir: &Path, name: &str) -> Result<(), String> {
    let mut backups: Vec<(u128, PathBuf)> = fs::read_dir(dir)
        .map_err(|e| format!("Failed to list {}: {}", dir.display(), e))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter_map(|path| Some((backup_time(&path, name)?, path)))
        .collect();

    backups.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, old) in backups.into_iter().skip(KEEP_PER_FILE) {
        fs::remove_file(&old).map_err(|e| format!("Failed to remove {}: {}", old.display(), e))?;
    }
    Ok(())
}

/// Timestamp of `<name>.v<N>.<timestamp>.json`; `None` for any other file.
fn backup_time(path: &Path, name: &str) -> Option<u128> {
    let file = path.file_name()?.to_str()?;
    let rest = file.strip_prefix(name)?.strip_prefix(".v")?.strip_suffix(".json")?;
    let (version, time) = rest.split_once('.')?;
    version.parse::<u32>().ok()?;
    time.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty folder per test (tests run in parallel).
    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lirah-backup-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn backup_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir.join("backups"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn no_file_means_no_backup() {
        let dir = test_dir("none");
        assert_eq!(backup(&dir.join("tasks.json")).unwrap(), None);
        assert!(!dir.join("backups").exists());
    }

    #[test]
    fn copies_the_file_named_with_its_version() {
        let dir = test_dir("copy");
        let path = dir.join("tasks.json");
        fs::write(&path, r#"{"version": 2, "revision": 5, "data": []}"#).unwrap();

        let made = backup(&path).unwrap().unwrap();

        assert!(made.file_name().unwrap().to_str().unwrap().starts_with("tasks.v2."));
        assert_eq!(fs::read_to_string(made).unwrap(), fs::read_to_string(&path).unwrap());
    }

    #[test]
    fn keeps_only_the_newest_three_of_that_file() {
        let dir = test_dir("prune");
        let path = dir.join("tasks.json");
        fs::write(&path, r#"{"version": 1}"#).unwrap();
        fs::create_dir_all(dir.join("backups")).unwrap();
        for name in ["tasks.v1.100.json", "tasks.v1.200.json", "tasks.v1.300.json", "tasks.v1.400.json", "plans.v1.100.json"] {
            fs::write(dir.join("backups").join(name), "{}").unwrap();
        }

        backup(&path).unwrap();

        let kept = backup_names(&dir);
        assert_eq!(kept.len(), 4, "3 tasks backups + the untouched plans one: {kept:?}");
        assert!(kept.contains(&"plans.v1.100.json".to_string()));
        assert!(!kept.contains(&"tasks.v1.100.json".to_string()));
        assert!(!kept.contains(&"tasks.v1.200.json".to_string()));
    }
}
