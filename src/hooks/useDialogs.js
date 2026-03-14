import { useState } from "react";

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
  const [branchTasksOpen, setBranchTasksOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [autoChangelogDialogOpen, setAutoChangelogDialogOpen] = useState(false);
  const [autoCommitConfigOpen, setAutoCommitConfigOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectPickerAction, setProjectPickerAction] = useState(null);
  const [instanceSyncPanelOpen, setInstanceSyncPanelOpen] = useState(false);
  const [orchestrationPromptOpen, setOrchestrationPromptOpen] = useState(false);
  const [orchestrationStatus, setOrchestrationStatus] = useState(null);

  return {
    addBookmarkDialogOpen, setAddBookmarkDialogOpen,
    bookmarksPaletteOpen, setBookmarksPaletteOpen,
    initialProjectDialogOpen, setInitialProjectDialogOpen,
    manageTemplatesDialogOpen, setManageTemplatesDialogOpen,
    saveFileGroupDialogOpen, setSaveFileGroupDialogOpen,
    diffDialogOpen, setDiffDialogOpen,
    diffFilePath, setDiffFilePath,
    cliSelectionModalOpen, setCliSelectionModalOpen,
    showHelp, setShowHelp,
    branchTasksOpen, setBranchTasksOpen,
    budgetDialogOpen, setBudgetDialogOpen,
    dashboardOpen, setDashboardOpen,
    autoChangelogDialogOpen, setAutoChangelogDialogOpen,
    autoCommitConfigOpen, setAutoCommitConfigOpen,
    workspaceDialogOpen, setWorkspaceDialogOpen,
    projectPickerOpen, setProjectPickerOpen,
    projectPickerAction, setProjectPickerAction,
    instanceSyncPanelOpen, setInstanceSyncPanelOpen,
    orchestrationPromptOpen, setOrchestrationPromptOpen,
    orchestrationStatus, setOrchestrationStatus,
  };
}
