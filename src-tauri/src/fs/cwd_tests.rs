use super::*;

/// The session cwd goes to the frontend: the app's path form, not the OS style.
#[test]
fn process_cwd_uses_the_app_path_form() {
    let got = process_cwd(std::process::id(), false).unwrap();
    let want = crate::paths::to_app(&std::env::current_dir().unwrap());
    assert_eq!(got, want);
}
