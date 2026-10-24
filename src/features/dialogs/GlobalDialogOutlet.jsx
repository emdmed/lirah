import { Suspense } from 'react';
import { NewTabDialog } from '@/features/tabs/NewTabDialog';
import { useDialogStore, useOpenDialogs } from './DialogProvider';

// App-wide dialogs, opened with `open(id, props, null)`. `ctx` is what App
// passes in; `entry` is what the dialog was opened with.
const GLOBAL_DIALOGS = {
  newTab: {
    Component: NewTabDialog,
    props: (ctx) => ({ currentPath: ctx.currentPath, onOpenProject: ctx.onOpenProject }),
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
          {...def.props?.(ctx, entry)}
        />
      </Suspense>
    );
  });
}
