use super::*;

#[test]
fn app_form_handles_windows_styles() {
    for (input, out) in [
        (r"C:\a\b", "C:/a/b"),
        (r"\\?\C:\a", "C:/a"),
        ("c:/a", "C:/a"),
        (r"c:\a/b\c", "C:/a/b/c"),
        (r"\\srv\share\x", "//srv/share/x"),
        (r"\\?\UNC\srv\share\x", "//srv/share/x"),
        (r"C:\a\b\", "C:/a/b"),
        ("/home/u/p/", "/home/u/p"),
        ("", ""),
    ] {
        assert_eq!(app_form(input), out, "input {input}");
    }
}

#[test]
fn canonical_has_no_verbatim_prefix() {
    let c = canonical(&std::env::temp_dir()).unwrap();
    assert!(!c.to_string_lossy().starts_with(r"\\?\"));
    if cfg!(windows) {
        assert!(!to_app(&c).contains('\\'));
    }
}
