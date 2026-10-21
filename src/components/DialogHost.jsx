import { Suspense } from "react";
import { lazyNamed } from "../lib/lazyNamed";
import { AddBookmarkDialog } from "../features/bookmarks/AddBookmarkDialog";
import { BookmarksPalette } from "../features/bookmarks/BookmarksPalette";
import { InitialProjectDialog } from "./InitialProjectDialog";
import { SaveFileGroupDialog } from "../features/file-groups/SaveFileGroupDialog";
import { CliSelectionModal } from "../features/cli-selection/CliSelectionModal";
import { TokenAlertBanner } from "../features/token-budget/TokenAlertBanner";
import { WorkspaceProjectPicker } from "./WorkspaceProjectPicker";
import { LirahLockup } from "./LirahMark";

// Heavy or rarely opened dialogs load on first open and mount only while
// open: closed dialogs cost nothing per render and stay out of the startup
// bundle (TokenDashboard alone pulls in recharts). Hotkey-driven palettes and
// small dialogs stay eager.
const ManageTemplatesDialog = lazyNamed(() => import("../features/templates/ManageTemplatesDialog"), "ManageTemplatesDialog");
const KeyboardShortcutsDialog = lazyNamed(() => import("./KeyboardShortcutsDialog"), "KeyboardShortcutsDialog");
const ElementPickerDialog = lazyNamed(() => import("../features/file-analysis/ElementPickerDialog"), "ElementPickerDialog");
const TokenBudgetDialog = lazyNamed(() => import("../features/token-budget/TokenBudgetDialog"), "TokenBudgetDialog");
const TokenDashboard = lazyNamed(() => import("../features/token-budget/TokenDashboard"), "TokenDashboard");
const AutoChangelogDialog = lazyNamed(() => import("../features/git/AutoChangelogDialog"), "AutoChangelogDialog");
const AutoCommitDialog = lazyNamed(() => import("../features/git/AutoCommitDialog"), "AutoCommitDialog");
const AutoMergeDialog = lazyNamed(() => import("../features/git/AutoMergeDialog"), "AutoMergeDialog");
const OrchestrationDashboard = lazyNamed(() => import("./OrchestrationDashboard"), "OrchestrationDashboard");
const WorkspaceDialog = lazyNamed(() => import("./WorkspaceDialog"), "WorkspaceDialog");
const SettingsDialog = lazyNamed(() => import("../features/settings/SettingsDialog"), "SettingsDialog");

function WhenOpen({ open, children }) {
  return open ? <Suspense fallback={null}>{children}</Suspense> : null;
}

export function DialogHost({
  dialogs,
  currentPath,
  settings,
  sessionId,
  toggleSandbox,
  toggleNetwork,
  cliAvailability,
  elementPicker,
  fileSelection,
  branchName,
  autoCommit,
  autoMerge,
  changelogStatus,
  tokenUsage,
  projectStats,
  refreshProjectStats,
  theme,
  workspaceHook,
  secondary,
  orchestrationCheck,
  navigateToBookmark,
  handleSelectProject,
  handleCreateWorkspace,
  handleOpenWorkspace,
}) {
  return (
    <>
      <WhenOpen open={dialogs.addBookmarkDialogOpen}>
        <AddBookmarkDialog
          open={dialogs.addBookmarkDialogOpen}
          onOpenChange={dialogs.setAddBookmarkDialogOpen}
          currentPath={currentPath}
        />
      </WhenOpen>
      <BookmarksPalette
        open={dialogs.bookmarksPaletteOpen}
        onOpenChange={dialogs.setBookmarksPaletteOpen}
        onNavigate={navigateToBookmark}
      />
      <WhenOpen open={dialogs.manageTemplatesDialogOpen}>
        <ManageTemplatesDialog
          open={dialogs.manageTemplatesDialogOpen}
          onOpenChange={dialogs.setManageTemplatesDialogOpen}
        />
      </WhenOpen>
      <WhenOpen open={dialogs.saveFileGroupDialogOpen}>
        <SaveFileGroupDialog
          open={dialogs.saveFileGroupDialogOpen}
          onOpenChange={dialogs.setSaveFileGroupDialogOpen}
          projectPath={currentPath}
          files={fileSelection.filesForGroup}
        />
      </WhenOpen>
      {dialogs.initialProjectDialogOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-background, #0a0a0a)' }}
        >
          <LirahLockup stacked size={60} />
        </div>
      )}
      <InitialProjectDialog
        open={dialogs.initialProjectDialogOpen}
        onOpenChange={dialogs.setInitialProjectDialogOpen}
        onSelectProject={handleSelectProject}
        workspaces={workspaceHook.workspaces}
        onOpenWorkspace={handleOpenWorkspace}
      />
      <WhenOpen open={dialogs.cliSelectionModalOpen}>
        <CliSelectionModal
          open={dialogs.cliSelectionModalOpen}
          onOpenChange={dialogs.setCliSelectionModalOpen}
          selectedCli={settings.selectedCli}
          onCliChange={settings.setSelectedCli}
          cliAvailability={cliAvailability}
        />
      </WhenOpen>
      <WhenOpen open={dialogs.showHelp}>
        <KeyboardShortcutsDialog
          open={dialogs.showHelp}
          onOpenChange={dialogs.setShowHelp}
        />
      </WhenOpen>
      <WhenOpen open={elementPicker.elementPickerOpen}>
        <ElementPickerDialog
          open={elementPicker.elementPickerOpen}
          onOpenChange={elementPicker.setElementPickerOpen}
          filePath={elementPicker.elementPickerFilePath}
          currentPath={currentPath}
          onAddElements={elementPicker.handleAddElements}
        />
      </WhenOpen>
      <TokenAlertBanner
        projectPath={currentPath}
        onOpenBudgetSettings={() => dialogs.setBudgetDialogOpen(true)}
      />
      <WhenOpen open={dialogs.settingsOpen}>
        <SettingsDialog
          open={dialogs.settingsOpen}
          onOpenChange={dialogs.setSettingsOpen}
          settings={settings}
          sessionId={sessionId}
          onToggleSandbox={toggleSandbox}
          onToggleNetwork={toggleNetwork}
          onOpenBudget={() => dialogs.setBudgetDialogOpen(true)}
        />
      </WhenOpen>
      <WhenOpen open={dialogs.budgetDialogOpen}>
        <TokenBudgetDialog
          open={dialogs.budgetDialogOpen}
          onOpenChange={dialogs.setBudgetDialogOpen}
          projectPath={currentPath}
        />
      </WhenOpen>
      <WhenOpen open={dialogs.autoChangelogDialogOpen}>
        <AutoChangelogDialog
          open={dialogs.autoChangelogDialogOpen}
          onOpenChange={dialogs.setAutoChangelogDialogOpen}
          enabled={settings.autoChangelogEnabled}
          trigger={settings.autoChangelogTrigger}
          targetFile={settings.autoChangelogTarget}
          cli={settings.autoChangelogCli}
          onSave={({ enabled, trigger, targetFile, cli }) => {
            settings.setAutoChangelogEnabled(enabled);
            settings.setAutoChangelogTrigger(trigger);
            settings.setAutoChangelogTarget(targetFile);
            settings.setAutoChangelogCli(cli);
          }}
        />
      </WhenOpen>
      <WhenOpen open={dialogs.dashboardOpen}>
        <TokenDashboard
          open={dialogs.dashboardOpen}
          onOpenChange={dialogs.setDashboardOpen}
          tokenUsage={tokenUsage}
          projectStats={projectStats}
          refreshStats={refreshProjectStats}
          projectPath={currentPath}
          theme={theme}
        />
      </WhenOpen>
      <WhenOpen open={autoCommit.stage !== 'idle'}>
        <AutoCommitDialog autoCommit={autoCommit} />
      </WhenOpen>
      <WhenOpen open={autoMerge.stage !== 'idle'}>
        <AutoMergeDialog autoMerge={autoMerge} />
      </WhenOpen>
      <WhenOpen open={dialogs.workspaceDialogOpen}>
        <WorkspaceDialog
          open={dialogs.workspaceDialogOpen}
          onOpenChange={dialogs.setWorkspaceDialogOpen}
          onCreateWorkspace={handleCreateWorkspace}
          existingWorkspaces={workspaceHook.workspaces}
          onOpenWorkspace={handleOpenWorkspace}
          onDeleteWorkspace={workspaceHook.deleteWorkspace}
        />
      </WhenOpen>
      {dialogs.projectPickerOpen && workspaceHook.workspace?.projects && (
        <WorkspaceProjectPicker
          projects={workspaceHook.workspace.projects}
          onSelect={(project) => {
            dialogs.setProjectPickerOpen(false);
            const path = project.real_path || project.path;
            if (dialogs.projectPickerAction === 'lazygit') {
              secondary.openWithCommand('lazygit', path);
            } else if (dialogs.projectPickerAction === 'autocommit') {
              autoCommit.trigger(path);
            } else if (dialogs.projectPickerAction === 'automerge') {
              autoMerge.trigger(path);
            }
            dialogs.setProjectPickerAction(null);
          }}
          onCancel={() => {
            dialogs.setProjectPickerOpen(false);
            dialogs.setProjectPickerAction(null);
          }}
        />
      )}
      <WhenOpen open={dialogs.orchestrationDashboardOpen}>
        <OrchestrationDashboard
          open={dialogs.orchestrationDashboardOpen}
          onOpenChange={dialogs.setOrchestrationDashboardOpen}
          projectPath={currentPath}
          orchestrationCheck={orchestrationCheck}
        />
      </WhenOpen>
    </>
  );
}
