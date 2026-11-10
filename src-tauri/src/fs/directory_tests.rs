use super::*;
use crate::paths::to_app;

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("lirah-dir-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(d.join("sub")).unwrap();
    fs::write(d.join("a.txt"), "x").unwrap();
    fs::write(d.join("sub").join("b.txt"), "x").unwrap();
    d
}

/// Directory entries are sent to the frontend: paths in the app's form.
#[test]
fn list_dir_entries_use_the_app_path_form() {
    let d = scratch("list");
    let mut got: Vec<String> = list_dir(&d, false).unwrap().into_iter().map(|e| e.path).collect();
    got.sort();
    let want = vec![to_app(&d.join("a.txt")), to_app(&d.join("sub"))];
    let _ = fs::remove_dir_all(&d);
    assert_eq!(got, want);
}

#[test]
fn recursive_walk_paths_and_parent_paths_use_the_app_path_form() {
    let d = scratch("walk");
    let listing = walk_breadth_first(&d, 5, 100);
    let _ = fs::remove_dir_all(&d);
    let mut got: Vec<(String, String)> = listing.entries.into_iter().map(|e| (e.path, e.parent_path)).collect();
    got.sort();
    let mut want = vec![
        (to_app(&d.join("a.txt")), to_app(&d)),
        (to_app(&d.join("sub")), to_app(&d)),
        (to_app(&d.join("sub").join("b.txt")), to_app(&d.join("sub"))),
    ];
    want.sort();
    assert_eq!(got, want);
}
