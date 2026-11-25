// Files a release bump rewrites; they say nothing about what a change was about.
const RELEASE_FILES = new Set(['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock', 'tauri.conf.json']);

/** True for a version-bump file at any depth (e.g. 'src-tauri/Cargo.toml'). */
export const isReleaseBumpFile = (path) => RELEASE_FILES.has(path.split('/').pop());
