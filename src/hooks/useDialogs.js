import { useMemo, useState } from "react";

export function useDialogs() {
  const [addBookmarkDialogOpen, setAddBookmarkDialogOpen] = useState(false);
  const [bookmarksPaletteOpen, setBookmarksPaletteOpen] = useState(false);
  const [initialProjectDialogOpen, setInitialProjectDialogOpen] = useState(false);
  const [manageTemplatesDialogOpen, setManageTemplatesDialogOpen] = useState(false);
  const [saveFileGroupDialogOpen, setSaveFileGroupDialogOpen] = useState(false);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffFilePath, setDiffFilePath] = useState(null);
  const [cliSelectionModalOpen, setCliSelectionModalOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [autoChangelogDialogOpen, setAutoChangelogDialogOpen] = useState(false);
  const [autoCommitConfigOpen, setAutoCommitConfigOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectPickerAction, setProjectPickerAction] = useState(null);

  const [orchestrationDashboardOpen, setOrchestrationDashboardOpen] = useState(false);
  const [markdownViewerOpen, setMarkdownViewerOpen] = useState(false);
  const [markdownFilePath, setMarkdownFilePath] = useState(null);

  // Setters are stable, so the object only changes when a dialog opens or
  // closes — consumers that depend on `dialogs` don't re-run on every render.
  return useMemo(() => ({
    addBookmarkDialogOpen, setAddBookmarkDialogOpen,
    bookmarksPaletteOpen, setBookmarksPaletteOpen,
    initialProjectDialogOpen, setInitialProjectDialogOpen,
    manageTemplatesDialogOpen, setManageTemplatesDialogOpen,
    saveFileGroupDialogOpen, setSaveFileGroupDialogOpen,
    diffDialogOpen, setDiffDialogOpen,
    diffFilePath, setDiffFilePath,
    cliSelectionModalOpen, setCliSelectionModalOpen,
    showHelp, setShowHelp,
    budgetDialogOpen, setBudgetDialogOpen,
    dashboardOpen, setDashboardOpen,
    autoChangelogDialogOpen, setAutoChangelogDialogOpen,
    autoCommitConfigOpen, setAutoCommitConfigOpen,
    workspaceDialogOpen, setWorkspaceDialogOpen,
    projectPickerOpen, setProjectPickerOpen,
    projectPickerAction, setProjectPickerAction,

    orchestrationDashboardOpen, setOrchestrationDashboardOpen,
    markdownViewerOpen, setMarkdownViewerOpen,
    markdownFilePath, setMarkdownFilePath,
  }), [
    addBookmarkDialogOpen, bookmarksPaletteOpen, initialProjectDialogOpen,
    manageTemplatesDialogOpen, saveFileGroupDialogOpen, diffDialogOpen, diffFilePath,
    cliSelectionModalOpen, showHelp, budgetDialogOpen, dashboardOpen,
    autoChangelogDialogOpen, autoCommitConfigOpen, workspaceDialogOpen, projectPickerOpen,
    projectPickerAction, orchestrationDashboardOpen, markdownViewerOpen, markdownFilePath,
  ]);
}
