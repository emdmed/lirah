import { useMemo, useState } from "react";
import { useDialogStore, useOpenDialogs } from "../features/dialogs/DialogProvider";

// A tab's dialogs as `{ settingsOpen, setSettingsOpen, … }`. Open state lives
// in DialogProvider under the tab's scope; this keeps the flag-and-setter
// shape that shortcuts and commands use. Setters accept a value or an
// updater, like useState's.
const FLAGS = {
  addBookmarkDialogOpen: "addBookmark",
  bookmarksPaletteOpen: "bookmarks",
  initialProjectDialogOpen: "initialProject",
  manageTemplatesDialogOpen: "templates",
  saveFileGroupDialogOpen: "saveFileGroup",
  diffDialogOpen: "gitDiff",
  cliSelectionModalOpen: "cliSelection",
  showHelp: "help",
  budgetDialogOpen: "budget",
  settingsOpen: "settings",
  dashboardOpen: "tokens",
  autoChangelogDialogOpen: "autoChangelog",
  workspaceDialogOpen: "workspace",
  projectPickerOpen: "projectPicker",
  orchestrationDashboardOpen: "orchestration",
  markdownViewerOpen: "markdown",
};

const setterName = (flag) => `set${flag[0].toUpperCase()}${flag.slice(1)}`;

export function useDialogs(scope) {
  const store = useDialogStore();
  const open = useOpenDialogs(scope);

  // What a dialog opens on, set just before it opens.
  const [diffFilePath, setDiffFilePath] = useState(null);
  const [markdownFilePath, setMarkdownFilePath] = useState(null);
  const [projectPickerAction, setProjectPickerAction] = useState(null);

  const setters = useMemo(() => {
    const out = {};
    for (const [flag, id] of Object.entries(FLAGS)) {
      out[setterName(flag)] = (next) => {
        const was = store.isOpen(id, scope);
        const now = typeof next === "function" ? next(was) : next;
        if (now && !was) store.open(id, {}, scope);
        else if (!now && was) store.close(id, scope);
      };
    }
    return out;
  }, [store, scope]);

  return useMemo(() => {
    const flags = {};
    for (const [flag, id] of Object.entries(FLAGS)) flags[flag] = id in open;
    return {
      ...flags,
      ...setters,
      diffFilePath, setDiffFilePath,
      markdownFilePath, setMarkdownFilePath,
      projectPickerAction, setProjectPickerAction,
    };
  }, [open, setters, diffFilePath, markdownFilePath, projectPickerAction]);
}
