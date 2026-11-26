import { Suspense } from 'react';
import { NewTabDialog } from '@/features/tabs/NewTabDialog';
import { lazyNamed } from '@/lib/lazyNamed';
import { useDialogStore, useOpenDialogs } from './DialogProvider';

const MarkdownViewerDialog = lazyNamed(() => import('@/features/markdown/MarkdownViewerDialog'), 'MarkdownViewerDialog');
const WorkspaceChangesDialog = lazyNamed(() => import('@/features/worklog/WorkspaceChangesDialog'), 'WorkspaceChangesDialog');
const GitDiffDialog = lazyNamed(() => import('@/features/git/GitDiffDialog'), 'GitDiffDialog');
const ArtifactViewerDialog = lazyNamed(() => import('@/features/artifacts/ArtifactViewerDialog'), 'ArtifactViewerDialog');

// App-wide dialogs, opened with `open(id, props, null)`. `ctx` is what App
// passes in; `entry` is what the dialog was opened with.
const GLOBAL_DIALOGS = {
  newTab: {
    Component: NewTabDialog,
    props: (ctx) => ({ currentPath: ctx.currentPath, onOpenProject: ctx.onOpenProject }),
  },
  // Read-only preview from outside a tab: one file (a saved prompt), or `files`
  // to step through (a draft plan's .md files).
  markdown: {
    Component: MarkdownViewerDialog,
    props: (_ctx, entry, store) => ({
      filePath: entry.filePath,
      markdownFiles: entry.files,
      onFileChange: (filePath) => store.open('markdown', { ...entry, filePath }, null),
    }),
  },
  // This week's changes of every tab in the active workspace; a row opens that tab's `changes`.
  workspaceChanges: { Component: WorkspaceChangesDialog },
  // A change's commits as one diff, from the workspace's changes (the entry has repoPath, refs and files).
  gitDiff: { Component: GitDiffDialog, props: (_ctx, entry) => entry },
  // A repo's HTML artifact (`lirah artifacts`, the sidebar's artifacts section).
  artifact: {
    Component: ArtifactViewerDialog,
    props: (_ctx, entry, store) => ({
      repo: entry.repo,
      name: entry.name,
      onNameChange: (name) => store.open('artifact', { ...entry, name }, null),
    }),
  },
};

export function GlobalDialogOutlet(ctx) {
  const store = useDialogStore();
  const open = useOpenDialogs(null);
  return Object.entries(open).map(([id, entry]) => {
    const def = GLOBAL_DIALOGS[id];
    if (!def) return null;
    const { Component } = def;
    return (
      <Suspense key={id} fallback={null}>
        <Component
          open
          onOpenChange={(next) => { if (!next) store.close(id, null); }}
          {...def.props?.(ctx, entry, store)}
        />
      </Suspense>
    );
  });
}
