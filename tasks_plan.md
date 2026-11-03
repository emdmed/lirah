# Tasks: a backlog that turns into plans

## Context
Ideas and to-dos get lost between agent sessions. The user wants a **tasks** view in Lirah to jot a task in seconds, keep it locally as a backlog, and later turn it into a full plan by asking an agent. Between the task and the plan sits a configurable **plan context** (e.g. "create plans using the grill-me skill"), kept as named presets.

Decisions (from the user):
- Storage: **both** a global task list and a per-project backlog.
- Task → plan: **send to the agent tab** (prompt = preset context + task), then link the resulting plan back to the task.
- Context: **named presets**, one default, pick per send.
- Fields: title + notes, status, drag reorder.

On approval, also save this plan in the repo root as `tasks_plan.md` (house rule).

## Where it lives
A new `tasks` sub-tab in the right sidebar (pane [4]), next to `plans`. Top-level tabs are all projects, so this matches how Plans is wired.
- `src/features/agent-jobs/RightSidebar.jsx`: add `<TabButton label="tasks" count={openTasks}>` beside plans (~:591) and a `tab === 'tasks' ? <TasksPane projectPath=…/>` branch (~:637).

## New feature folder `src/features/tasks/`
1. **`useTaskStore.js`**: copy of `src/features/plans/usePlanStore.js` (same load/mutate/debounced `write_file_content` pattern). Two scopes:
   - project: `~/.lirah/tasks/<name>-<hash8>/tasks.json`, keyed by project path (no git required, unlike Plans)
   - global: `~/.lirah/tasks/global.json`
   Uses `lirahDir` (`src/lib/lirahPaths.js`), `hash8` (`src/lib/ids.js`), `get_home_dir`.
2. **`taskModel.js`**: pure helpers. Task = `{ id, title, notes, status: 'backlog'|'planning'|'planned'|'done', planFile?, planId?, createdAt, updatedAt }`. `normalizeTask`, `slugify(title)`, `reorder(list, from, to)`, `moveTask` between scopes.
3. **`TasksContext.jsx`**: provider (mounted in `src/main.jsx` next to the Plans provider) exposing `addTask`, `updateTask`, `removeTask`, `reorderTasks`, `moveToScope`, `useTasks(scope)`.
4. **`TasksPane.jsx`**: scope switch `project | global` with counts; a quick-add input at the top (Enter saves the title, Shift+Enter opens notes); the list; done tasks collapsed at the bottom.
   - **`TaskRow.jsx`**: styled after `PlanRow.jsx` (`edge-b-engraved`, `Lamp` for status); inline edit of title/notes; drag reorder with `src/features/tabs/useDragReorder.js`; j/k/Enter via `src/hooks/useRowCursor.js`; actions: plan ▸ (with preset picker), done, move to global/project, delete.
   - Empty state with `EmptyLine` from `src/features/plans/parts.jsx`; "+ task" with `PanelButton`.
5. **`planContexts.js`**: the presets store in localStorage via `loadJson`/`saveJson` (`src/lib/storage.js`), the same way `src/features/templates/PromptTemplatesContext.jsx` stores templates. Shape: `[{ id, name, text }]` plus `defaultId`. Seeded with one preset, "Plan", text: "Write a full implementation plan for this task."
6. **`PlanContextsDialog.jsx`**: list/add/edit/delete presets and set the default (uses `components/ui/dialog`, `input`, `textarea`). Opened from the tasks pane header and from a new Settings row.
7. **`tasksPaneEvents.js`**: `requestTasksPane()` and `requestQuickTask()`, copied from `src/features/plans/plansPaneEvents.js` (register event names in `src/lib/appEvents.js`).

## Task → plan
- `buildTaskPlanPrompt({ task, context, planFile })` in `src/features/plans/planPrompts.js`: the context text, then the task title + notes, then "Save the finished plan as `<planFile>` in the repo root." `planFile` = `<slug>_plan.md`. That name matches the `*_plan.md` pattern `usePlanFiles.js` already finds and offers to import.
- Send with the existing `sendToTab(activeTabId, text)` from `PlansContext.jsx:284` (bracketed paste + Enter, via `src/features/tabs/tabPrompts.js`). If there is no agent tab, show a toast and copy the prompt to the clipboard.
- The task becomes `planning` with `planFile` set. For a global task, the plan goes to the active tab's project.
- Link back: the tasks pane checks `path_exists` for `planning` tasks when it opens and when the repo's plan files rescan. Found → `planned`. When the file is imported as a plan (`plan.importedFrom.path` matches), store `planId`; the row then shows "open plan", which calls `requestPlanFocus`.

## Settings, shortcuts, palette
- `src/features/settings/settingsSections.js` + `SettingsDialog.jsx`: a "Plan contexts" row (agent section) with a button that opens `PlanContextsDialog`. The presets stay out of `SETTINGS_DEFAULTS` (they're an array, and keyed rows become settable by the agent CLI).
- `src/lib/shortcuts.js`: `quick-task` on **Alt+Q** (free). It opens the tasks pane with the quick-add input focused, in the current project scope.
- `src/features/tabs/useTabCommands.js`: palette entries `tasks` (toggle the pane) and `task` (quick add).
- Collapsed rail in `RightSidebar.jsx` (~:459-530): show a count of open tasks.

## Out of scope
Priorities, tags, due dates, syncing tasks into the repo.

## Verification
- `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml` (no Rust changes expected), `npm run check:async-commands`, `npm run check:contrast`.
- Unit tests for `taskModel.js` (reorder, slugify, normalize), if the repo has a JS test runner. Otherwise check them by hand.
- Manual check in the app (I can't screenshot the Tauri window, so you run it): Alt+Q, type a task, Enter. Restart and confirm it persisted in both scopes. Drag to reorder. Add a "grill-me" preset, press plan ▸ on a task, and confirm the agent tab receives context + task. When `<slug>_plan.md` appears, the task shows `planned`. Import it, and "open plan" jumps to it.
