// File layer for the `lirah` CLI: JSON files under ~/.lirah with the same
// rules as store.rs. Each file is a JSON object whose top-level `version` and
// `revision` keys belong to the store. Writes go to a temp file in the same
// folder and are renamed over the target; a write naming an expected revision
// fails with a conflict if the file moved on since it was read.
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

// Keep in step with CURRENT_VERSION and MIGRATIONS in store.rs.
const CURRENT_VERSION = 1;
// [from, (rel, doc) => void]: upgrades a doc at version `from` to `from + 1`.
const MIGRATIONS = [];

// {kind: 'conflict', current} or {kind: 'io', message}, like store.rs.
export class StoreError extends Error {
  constructor(kind, { message, current } = {}) {
    super(message || kind);
    this.kind = kind;
    if (kind === "conflict") this.current = current ?? null;
  }
}

// Read at call time so tests (and a changed HOME) see the right folder.
export const lirahDir = () => join(homedir(), ".lirah");

function storePath(rel) {
  const parts = typeof rel === "string" ? rel.split("/") : [];
  if (!rel || isAbsolute(rel) || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new StoreError("io", { message: `invalid store path: ${JSON.stringify(rel)}` });
  }
  return join(lirahDir(), ...parts);
}

/** The doc at `rel`, migrated, or null when it does not exist. */
export function read(rel) {
  const path = storePath(rel);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw new StoreError("io", { message: `${path}: ${e.message}` });
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new StoreError("io", { message: `${path}: ${e.message}` });
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new StoreError("io", { message: `${path}: not a JSON object` });
  }
  // A file without a version (hand-written) is taken as current.
  let version = Number.isInteger(doc.version) && doc.version >= 0 ? doc.version : CURRENT_VERSION;
  for (const [from, migrate] of MIGRATIONS) {
    if (from === version) {
      migrate(rel, doc);
      version = from + 1;
    }
  }
  doc.version = version;
  return doc;
}

export const revisionOf = (doc) => (Number.isInteger(doc?.revision) && doc.revision >= 0 ? doc.revision : 0);

/**
 * Write `data` atomically and return what was written. `expectedRevision`
 * (0 for a file that must not exist yet) makes it fail with a conflict when
 * the file's revision differs; null/undefined skips the check.
 * shortcut: no lock between processes, same as store.rs; a write racing the app can slip past the check.
 */
export function write(rel, data, expectedRevision = null) {
  const path = storePath(rel);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new StoreError("io", { message: "store data must be a JSON object" });
  }
  const current = read(rel);
  const revision = revisionOf(current);
  if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== revision) {
    throw new StoreError("conflict", { current });
  }
  const doc = { ...data, version: CURRENT_VERSION, revision: revision + 1 };
  const dir = dirname(path);
  const tmp = join(dir, `.${path.slice(dir.length + 1)}.tmp-${process.pid}`);
  try {
    mkdirSync(dir, { recursive: true });
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify(doc, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new StoreError("io", { message: `${path}: ${e.message}` });
  }
  return doc;
}

/** Entry names of the folder at `rel`, sorted, dotfiles left out; [] when missing (as store_list). */
export function list(rel) {
  const path = storePath(rel);
  try {
    return readdirSync(path).filter((n) => !n.startsWith(".")).sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw new StoreError("io", { message: `${path}: ${e.message}` });
  }
}

const inside = (dir, path) => {
  const rel = relative(dir, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
};

/**
 * The workspace id the CLI acts on: $LIRAH_WORKSPACE (set on every Lirah
 * terminal) when it names a workspace in the index, else the workspace with
 * the tab whose path is the deepest folder containing `cwd`. Null if none.
 */
export function resolveWorkspace(cwd = process.cwd(), env = process.env) {
  const ids = read("workspaces/index.json")?.workspaces;
  if (!Array.isArray(ids)) return null;
  const fromEnv = env.LIRAH_WORKSPACE;
  if (fromEnv && ids.includes(fromEnv)) return fromEnv;
  const here = resolvePath(cwd);
  let best = null;
  let depth = -1;
  for (const id of ids) {
    let ws;
    try {
      ws = read(`workspaces/${id}/workspace.json`);
    } catch {
      continue; // one broken workspace file must not hide the others
    }
    for (const tab of ws?.tabs ?? []) {
      if (typeof tab?.projectPath !== "string" || !tab.projectPath) continue;
      const path = resolvePath(tab.projectPath);
      if (inside(path, here) && path.length > depth) {
        best = id;
        depth = path.length;
      }
    }
  }
  return best;
}
