import { Suspense, useContext } from "react";
import { lazyNamed } from "../lib/lazyNamed";
import { BookmarksPalette } from "../features/bookmarks/BookmarksPalette";
import { InitialProjectDialog } from "./InitialProjectDialog";
import { BudgetAlerts } from "../features/token-budget/useBudgetAlerts";
import { LirahLockup } from "./LirahMark";
import { TAB_DIALOGS } from "../features/dialogs/registry";
import { useDialogStore, useOpenDialogs } from "../features/dialogs/DialogProvider";
import { DialogScopeContext } from "../features/dialogs/dialogStore";

const ElementPickerDialog = lazyNamed(() => import("../features/file-analysis/ElementPickerDialog"), "ElementPickerDialog");
const AutoCommitDialog = lazyNamed(() => import("../features/git/AutoCommitDialog"), "AutoCommitDialog");
const AutoMergeDialog = lazyNamed(() => import("../features/git/AutoMergeDialog"), "AutoMergeDialog");

function WhenOpen({ open, children }) {
  return open ? <Suspense fallback={null}>{children}</Suspense> : null;
}

// Draws the tab's dialogs. Whatever is open in this tab's scope comes from
// the registry; the rest are palettes kept mounted so they can animate out,
// and dialogs driven by their own hook's stage.
export function DialogHost(ctx) {
  const { dialogs, elementPicker, autoCommit, autoMerge, currentPath } = ctx;
  const { scope, active } = useContext(DialogScopeContext);
  const store = useDialogStore();
  const open = useOpenDialogs(scope);

  return (
    <>
      {Object.entries(open).map(([id, entry]) => {
        const def = TAB_DIALOGS[id];
        if (!def || (def.when && !def.when(ctx))) return null;
        const { Component } = def;
        return (
          <Suspense key={id} fallback={null}>
            <Component
              open
              onOpenChange={(next) => { if (!next) store.close(id, scope); }}
              {...def.props?.(ctx, entry)}
            />
          </Suspense>
        );
      })}

      <BookmarksPalette
        open={dialogs.bookmarksPaletteOpen}
        onOpenChange={dialogs.setBookmarksPaletteOpen}
        onNavigate={ctx.navigateToBookmark}
      />
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
        onSelectProject={ctx.handleSelectProject}
        workspaces={ctx.workspaceHook.workspaces}
        onOpenWorkspace={ctx.handleOpenWorkspace}
      />

      <WhenOpen open={elementPicker.elementPickerOpen}>
        <ElementPickerDialog
          open={elementPicker.elementPickerOpen}
          onOpenChange={elementPicker.setElementPickerOpen}
          filePath={elementPicker.elementPickerFilePath}
          currentPath={currentPath}
          onAddElements={elementPicker.handleAddElements}
        />
      </WhenOpen>
      <WhenOpen open={autoCommit.stage !== 'idle'}>
        <AutoCommitDialog autoCommit={autoCommit} />
      </WhenOpen>
      <WhenOpen open={autoMerge.stage !== 'idle'}>
        <AutoMergeDialog autoMerge={autoMerge} />
      </WhenOpen>

      <BudgetAlerts
        projectPath={currentPath}
        isActive={active}
        onOpenBudget={() => dialogs.setBudgetDialogOpen(true)}
      />
    </>
  );
}
