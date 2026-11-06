# Persistence

How Lirah keeps its data in files, and why it can be trusted with it.

## Why it exists

Lirah keeps part of its data in the browser's `localStorage` and part in a few JSON files that are simply overwritten. Both are fragile: a crash in the middle of a write can leave a broken file, and two writers (two windows, the CLI, an agent) can silently erase each other's work.

The persistence layer is the single, careful way to read and write the JSON files in `~/.lirah/`. The data is moving there from `localStorage`, and this layer makes the move safe.

## What it does

- **Read.** Gives back a file's content together with its schema version and its revision.
- **Change with retries.** A change is a function applied to the current content. If someone else saved first, the layer reads the file again and re-applies the change, up to 3 times. If it still fails, it reports the error and keeps the change in memory.
- **Save after a short pause.** Changes are saved 400 ms after the last one, so a burst of edits is one write.
- **Save on close.** Closing the window first saves whatever is still waiting.
- **Notice outside changes.** When another process changes a file, the UI is told. Its own writes do not notify it.
- **Upgrade old files.** When the format of a file changes, it is backed up and then upgraded step by step.

## How the parts talk

```
 UI (React stores)
   │  read / update / subscribe / migrate / flushAll
   ▼
 JS API (src/lib/persistence.js)   ← waits 400 ms, retries on conflict
   │  Tauri commands
   ▼
 Rust (src-tauri/src/persistence)  ← checks the revision, writes safely
   │
   ▼
 ~/.lirah/*.json  ──────────────┐
   ▲                            │ a change by another process
   └── Rust watcher ── event "lirah-file-changed" ──► UI
```

The JS side decides *when* to read and save. The Rust side decides whether a write is *allowed* and does it safely. The watcher runs in Rust and reports through an event.

## The data on disk

Every file is an envelope:

| Field | Meaning |
| ----- | ------- |
| `version` | The schema: which format `data` is in. Changes when the format changes. |
| `revision` | A counter that goes up by one on every write. Used to detect conflicts. |
| `data` | The content itself. |

- **Layout.** Files live under `~/.lirah/`, in any folder depth (for example `~/.lirah/tasks/global.json`).
- **Backups.** Before an upgrade, the file is copied to a `backups` folder next to it, named `<name>.v<version>.<timestamp>.json`. The last 3 backups per file are kept.
- **Old files.** Files written before this layer (tasks, plans) have no `revision` and no `data`. They read as revision 0, and their other keys count as the data.
- **Missing file.** Reading gives nothing. The first write creates the file and its folders.

## What happens when…

- **Two writers conflict.** Each write states the revision it started from. The second writer finds the file already moved on and is refused. The layer re-reads and re-applies the change, so both changes survive. After 3 failed attempts the error is reported and the change stays in memory, to be tried again at the next change or on close.
- **A second process writes at the same time.** The write lock covers this app only. Another process (the CLI, B-078) is not protected yet and could slip in between the check and the write.
- **The app crashes mid-write.** A write goes to a temporary file first and is then renamed over the real one. The file is either the old version or the new one, never half of each.
- **The window closes with a pending change.** Closing waits for the layer to save everything that is still in its 400 ms pause.
- **An upgrade fails.** The file is backed up first and written only once, after every step has run. A failing step stops before the write, so the file stays as it was, with the backup next to it.
- **A file is corrupt.** Reading it is an error, and it is never overwritten, so it can be inspected or restored.

## Not done yet

No store uses the layer yet. The tasks, plans and `localStorage` data still use their own saving. Moving them is tracked in B-074, B-075 and B-076. Until then, the layer changes nothing in how Lirah behaves. The existing `write_file_content` stays for those current uses.
