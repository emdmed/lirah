import { AddBookmarkDialog } from "../features/bookmarks";
import { BookmarksPalette } from "../features/bookmarks";
import { InitialProjectDialog } from "./InitialProjectDialog";
import { ManageTemplatesDialog } from "../features/templates";
import { GitDiffDialog, BranchCompletedTasksDialog } from "../features/git";
import { SaveFileGroupDialog } from "../features/file-groups";
import { CliSelectionModal } from "../features/cli-selection";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { ElementPickerDialog } from "../features/file-analysis";
import { TokenBudgetDialog } from "../features/token-budget";
import { TokenAlertBanner } from "../features/token-budget";
import { TokenDashboard } from "../features/token-budget";
import { AutoChangelogDialog, AutoCommitDialog, AutoCommitConfigDialog } from "../features/git";
import { OrchestrationPrompt } from "./OrchestrationPrompt";
import { ToastContainer } from "../features/toast";
import { InstanceSyncPanel } from "../features/instance-sync/InstanceSyncPanel";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { WorkspaceProjectPicker } from "./WorkspaceProjectPicker";

export function DialogHost({
  dialogs,
  currentPath,
  settings,
  cliAvailability,
  elementPicker,
  fileSelection,
  instanceSync,
  branchName,
  branchTasks,
  autoCommit,
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
  handleLoadInstanceContext,
  handleSendImplementationPrompt,
  handleOrchestrationInstall,
}) {
  return (
    <>
      <InstanceSyncPanel
        open={dialogs.instanceSyncPanelOpen}
        onOpenChange={(open) => {
          dialogs.setInstanceSyncPanelOpen(open);
          if (!open) instanceSync.clearSelectedInstance();
        }}
        ownState={instanceSync.ownState}
        otherInstances={instanceSync.otherInstances}
        selectedInstance={instanceSync.selectedInstance}
        selectedInstanceSessions={instanceSync.selectedInstanceSessions}
        selectedSession={instanceSync.selectedSession}
        isLoadingSessions={instanceSync.isLoadingSessions}
        sessionsHasMore={instanceSync.sessionsHasMore}
        onSelectInstance={instanceSync.selectInstance}
        onClearSelectedInstance={instanceSync.clearSelectedInstance}
        onLoadMoreSessions={instanceSync.loadMoreSessions}
        onFetchSessionContent={instanceSync.fetchSessionContent}
        onRefresh={instanceSync.refreshInstances}
        onCleanup={instanceSync.cleanupStaleInstances}
        onLoadContext={handleLoadInstanceContext}
        onSendToTerminal={handleSendImplementationPrompt}
        onDebugPaths={instanceSync.debugClaudeDataPaths}
        onDebugOpencodePaths={instanceSync.debugOpencodeDataPaths}
        isLoading={false}
        error={instanceSync.error}
      />

      <AddBookmarkDialog
        open={dialogs.addBookmarkDialogOpen}
        onOpenChange={dialogs.setAddBookmarkDialogOpen}
        currentPath={currentPath}
      />
      <BookmarksPalette
        open={dialogs.bookmarksPaletteOpen}
        onOpenChange={dialogs.setBookmarksPaletteOpen}
        onNavigate={navigateToBookmark}
      />
      <ManageTemplatesDialog
        open={dialogs.manageTemplatesDialogOpen}
        onOpenChange={dialogs.setManageTemplatesDialogOpen}
      />
      <SaveFileGroupDialog
        open={dialogs.saveFileGroupDialogOpen}
        onOpenChange={dialogs.setSaveFileGroupDialogOpen}
        projectPath={currentPath}
        files={fileSelection.filesForGroup}
      />
      {dialogs.initialProjectDialogOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-background, #0a0a0a)' }}
        >
          <div style={{ fontFamily: "'Grenze Gotisch', serif", fontSize: '42px', lineHeight: 1 }}>
            Lirah
          </div>
        </div>
      )}
      <InitialProjectDialog
        open={dialogs.initialProjectDialogOpen}
        onOpenChange={dialogs.setInitialProjectDialogOpen}
        onSelectProject={handleSelectProject}
        workspaces={workspaceHook.workspaces}
        onOpenWorkspace={handleOpenWorkspace}
      />
      <CliSelectionModal
        open={dialogs.cliSelectionModalOpen}
        onOpenChange={dialogs.setCliSelectionModalOpen}
        selectedCli={settings.selectedCli}
        onCliChange={settings.setSelectedCli}
        cliAvailability={cliAvailability}
      />
      <KeyboardShortcutsDialog
        open={dialogs.showHelp}
        onOpenChange={dialogs.setShowHelp}
      />
      <ElementPickerDialog
        open={elementPicker.elementPickerOpen}
        onOpenChange={elementPicker.setElementPickerOpen}
        filePath={elementPicker.elementPickerFilePath}
        currentPath={currentPath}
        onAddElements={elementPicker.handleAddElements}
      />
      <TokenAlertBanner
        projectPath={currentPath}
        onOpenBudgetSettings={() => dialogs.setBudgetDialogOpen(true)}
      />
      <TokenBudgetDialog
        open={dialogs.budgetDialogOpen}
        onOpenChange={dialogs.setBudgetDialogOpen}
        projectPath={currentPath}
      />
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
      <TokenDashboard
        open={dialogs.dashboardOpen}
        onOpenChange={dialogs.setDashboardOpen}
        tokenUsage={tokenUsage}
        projectStats={projectStats}
        refreshStats={refreshProjectStats}
        projectPath={currentPath}
        theme={theme}
      />
      <AutoCommitDialog autoCommit={autoCommit} />
      <WorkspaceDialog
        open={dialogs.workspaceDialogOpen}
        onOpenChange={dialogs.setWorkspaceDialogOpen}
        onCreateWorkspace={handleCreateWorkspace}
        existingWorkspaces={workspaceHook.workspaces}
        onOpenWorkspace={handleOpenWorkspace}
        onDeleteWorkspace={workspaceHook.deleteWorkspace}
      />
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
            }
            dialogs.setProjectPickerAction(null);
          }}
          onCancel={() => {
            dialogs.setProjectPickerOpen(false);
            dialogs.setProjectPickerAction(null);
          }}
        />
      )}
      <AutoCommitConfigDialog
        open={dialogs.autoCommitConfigOpen}
        onOpenChange={dialogs.setAutoCommitConfigOpen}
        cli={settings.autoCommitCli}
        customPrompt={settings.autoCommitCustomPrompt}
        onSave={({ cli, customPrompt }) => {
          settings.setAutoCommitCli(cli);
          settings.setAutoCommitCustomPrompt(customPrompt);
        }}
      />
      <OrchestrationPrompt
        open={dialogs.orchestrationPromptOpen}
        onOpenChange={dialogs.setOrchestrationPromptOpen}
        status={dialogs.orchestrationStatus}
        onInstall={handleOrchestrationInstall}
        installing={orchestrationCheck.installing}
      />
      <ToastContainer />
    </>
  );
}
