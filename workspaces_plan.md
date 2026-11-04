# Workspaces as tab groups

A workspace is a named group of tabs. Switching workspace shows only its tabs;
the others keep running in the background.

Decisions (2026-11-04): background tabs keep running · the old symlink
workspaces are removed · the switcher sits at the top of the TABS pane.

## Model (TabContext)
- `workspaces: [{ id, name, lastTabId? }]`, saved under `nevo-terminal:workspaces`,
  active id under `nevo-terminal:workspaces:active`. First run: one `main` workspace.
- Each tab gets `workspaceId`; saved tabs without one join the first workspace.
- `tabs` stays every tab (rendering, attention, plans, agent control keep working);
  new `workspaceTabs` is the active workspace's tabs.
- `addTab` puts the tab in the active workspace. `switchTab` to a tab in another
  workspace switches workspace too (Alt+A, plans). The 8-tab limit stays global.
- New actions: `createWorkspace`, `switchWorkspace`, `renameWorkspace`,
  `removeWorkspace` (asks, then closes its tabs; the last workspace stays).
- An empty workspace shows the first-tab chooser.

## UI
- Workspace row above the tab list in the TABS pane: click to switch,
  double-click to rename, × to remove, + to add.
- TABS count, Ctrl+Tab and Ctrl+1–9 use the active workspace's tabs.
- Alt+W cycles workspaces; the palette's `workspace` command adds one.

## Removed
- Rust `workspace/` module and its six commands, `WorkspaceContext` and the cwd path map,
  the `junction` dependency.
- `useWorkspace`, `WorkspaceDialog`, `WorkspaceProjectPicker`, the status bar workspace
  menu, and the project picker before lazygit / auto-commit / auto-merge.
- Docs: workspace spec and mentions in the README and specs.
