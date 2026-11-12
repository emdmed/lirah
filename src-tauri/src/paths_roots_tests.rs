use super::*;

// A root keeps its slash: `C:/` is the drive, `C:` is that drive's current folder.
#[test]
fn app_form_keeps_the_slash_of_a_root() {
    for (input, out) in [
        (r"C:\", "C:/"),
        ("C:/", "C:/"),
        (r"\\?\C:\", "C:/"),
        ("c:\\", "C:/"),
        ("/", "/"),
        ("C:", "C:"),
        (r"C:\a\", "C:/a"),
        ("/a/", "/a"),
    ] {
        assert_eq!(app_form(input), out, "input {input}");
    }
}
