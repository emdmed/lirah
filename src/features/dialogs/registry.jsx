import { lazyNamed } from "@/lib/lazyNamed";
import { AddBookmarkDialog } from "@/features/bookmarks/AddBookmarkDialog";
import { SaveFileGroupDialog } from "@/features/file-groups/SaveFileGroupDialog";
import { CliSelectionModal } from "@/features/cli-selection/CliSelectionModal";
import { WorkspaceProjectPicker } from "@/components/WorkspaceProjectPicker";
import { useTokenUsageValue } from "@/features/token-budget/tokenUsageStore";

// Every dialog a tab can open, by id. `props(ctx, entry)` builds the dialog's
// props from the tab (`ctx`, what ProjectTab passes to DialogHost) and from
// what `open(id, entry)` was called with. Heavy or rarely opened dialogs load
// on first open and mount only while open, so closed dialogs cost nothing per
// render and stay out of the startup bundle (the token dashboard alone pulls
// in recharts).
//
// Not here: palettes that must animate out (bookmarks, the first-run project
// picker), which DialogHost keeps mounted, and dialogs driven by their own
// hook's state (auto commit, auto merge, element picker).

const ManageTemplatesDialog = lazyNamed(() => import("@/features/templates/ManageTemplatesDialog"), "ManageTemplatesDialog");
const KeyboardShortcutsDialog = lazyNamed(() => import("@/components/KeyboardShortcutsDialog"), "KeyboardShortcutsDialog");
const TokenBudgetDialog = lazyNamed(() => import("@/features/token-budget/TokenBudgetDialog"), "TokenBudgetDialog");
const TokenDashboard = lazyNamed(() => import("@/features/token-budget/TokenDashboard"), "TokenDashboard");
const ContextBreakdownDialog = lazyNamed(() => import("@/features/token-budget/ContextBreakdownDialog"), "ContextBreakdownDialog");
const AutoChangelogDialog = lazyNamed(() => import("@/features/git/AutoChangelogDialog"), "AutoChangelogDialog");
const OrchestrationDashboard = lazyNamed(() => import("@/components/OrchestrationDashboard"), "OrchestrationDashboard");
const WorkspaceDialog = lazyNamed(() => import("@/components/WorkspaceDialog"), "WorkspaceDialog");
const SettingsDialog = lazyNamed(() => import("@/features/settings/SettingsDialog"), "SettingsDialog");
const GitDiffDialog = lazyNamed(() => import("@/features/git/GitDiffDialog"), "GitDiffDialog");
const MarkdownViewerDialog = lazyNamed(() => import("@/features/markdown/MarkdownViewerDialog"), "MarkdownViewerDialog");

// The dashboard reads live usage from the tab's store, so usage polls don't
// re-render the dialog host.
function TokenDashboardLive({ tokenUsageStore, ...props }) {
  const tokenUsage = useTokenUsageValue(tokenUsageStore);
  return <TokenDashboard tokenUsage={tokenUsage} {...props} />;
}

function ContextBreakdownLive({ tokenUsageStore, ...props }) {
  const tokenUsage = useTokenUsageValue(tokenUsageStore);
  return <ContextBreakdownDialog tokenUsage={tokenUsage} {...props} />;
}

export const TAB_DIALOGS = {
  addBookmark: {
    Component: AddBookmarkDialog,
    props: (ctx) => ({ currentPath: ctx.currentPath }),
  },
  templates: { Component: ManageTemplatesDialog },
  saveFileGroup: {
    Component: SaveFileGroupDialog,
    props: (ctx) => ({ projectPath: ctx.currentPath, files: ctx.fileSelection.filesForGroup }),
  },
  cliSelection: {
    Component: CliSelectionModal,
    props: (ctx) => ({
      selectedCli: ctx.settings.selectedCli,
      onCliChange: ctx.settings.setSelectedCli,
      cliAvailability: ctx.cliAvailability,
    }),
  },
  help: { Component: KeyboardShortcutsDialog },
  settings: {
    Component: SettingsDialog,
    props: (ctx) => ({
      settings: ctx.settings,
      sessionId: ctx.sessionId,
      projectPath: ctx.currentPath,
      onToggleSandbox: ctx.toggleSandbox,
      onToggleNetwork: ctx.toggleNetwork,
      onOpenBudget: () => ctx.dialogs.setBudgetDialogOpen(true),
    }),
  },
  budget: {
    Component: TokenBudgetDialog,
    props: (ctx) => ({ projectPath: ctx.currentPath }),
  },
  autoChangelog: {
    Component: AutoChangelogDialog,
    props: ({ settings }) => ({
      enabled: settings.autoChangelogEnabled,
      trigger: settings.autoChangelogTrigger,
      targetFile: settings.autoChangelogTarget,
      cli: settings.autoChangelogCli,
      onSave: ({ enabled, trigger, targetFile, cli }) => {
        settings.setAutoChangelogEnabled(enabled);
        settings.setAutoChangelogTrigger(trigger);
        settings.setAutoChangelogTarget(targetFile);
        settings.setAutoChangelogCli(cli);
      },
    }),
  },
  tokens: {
    Component: TokenDashboardLive,
    props: (ctx) => ({
      tokenUsageStore: ctx.tokenUsageStore,
      projectStats: ctx.projectStats,
      refreshStats: ctx.refreshProjectStats,
      projectPath: ctx.currentPath,
      theme: ctx.theme,
    }),
  },
  contextBreakdown: {
    Component: ContextBreakdownLive,
    props: (ctx) => ({
      tokenUsageStore: ctx.tokenUsageStore,
      projectPath: ctx.currentPath,
      theme: ctx.theme,
    }),
  },
  workspace: {
    Component: WorkspaceDialog,
    props: (ctx) => ({
      onCreateWorkspace: ctx.handleCreateWorkspace,
      existingWorkspaces: ctx.workspaceHook.workspaces,
      onOpenWorkspace: ctx.handleOpenWorkspace,
      onDeleteWorkspace: ctx.workspaceHook.deleteWorkspace,
    }),
  },
  projectPicker: {
    Component: WorkspaceProjectPicker,
    when: (ctx) => !!ctx.workspaceHook.workspace?.projects,
    props: ({ dialogs, workspaceHook, secondary, autoCommit, autoMerge }) => {
      const done = () => {
        dialogs.setProjectPickerOpen(false);
        dialogs.setProjectPickerAction(null);
      };
      return {
        projects: workspaceHook.workspace.projects,
        action: dialogs.projectPickerAction,
        onSelect: (project) => {
          const action = dialogs.projectPickerAction;
          done();
          const path = project.real_path || project.path;
          if (action === "lazygit") secondary.openWithCommand("lazygit", path);
          else if (action === "autocommit") autoCommit.trigger(path);
          else if (action === "automerge") autoMerge.trigger(path);
        },
        onOpenChange: (open) => { if (!open) done(); },
      };
    },
  },
  orchestration: {
    Component: OrchestrationDashboard,
    props: (ctx) => ({ projectPath: ctx.currentPath, orchestrationCheck: ctx.orchestrationCheck }),
  },
  gitDiff: {
    Component: GitDiffDialog,
    props: (ctx) => ({ filePath: ctx.dialogs.diffFilePath, repoPath: ctx.currentPath }),
  },
  markdown: {
    Component: MarkdownViewerDialog,
    props: (ctx) => ({
      filePath: ctx.dialogs.markdownFilePath,
      repoPath: ctx.currentPath,
      markdownFiles: ctx.markdownFiles,
      onFileChange: ctx.viewMarkdownFile,
    }),
  },
};
