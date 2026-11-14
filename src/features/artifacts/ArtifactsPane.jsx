import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Edit, Trash, View } from '@/components/icons';
import { Button } from '../../components/ui/button';
import { Scanner } from '../../components/instrument/Scanner';
import { useConfirm, useDialogStore } from '../dialogs/DialogProvider';
import { useToast } from '../toast';
import { RenameField } from '../tabs/RenameField';
import { EmptyLine } from '../plans/parts';
import { useRepoRoot } from '../plans/planRepoRoot';
import { artifactName, artifactsRel } from '../../lib/lirahPaths';
import { deleteArtifact, listArtifacts, renameArtifact } from './artifactFiles';

// The project's HTML artifacts (~/.lirah/artifacts/<repo>/), kept fresh by the ~/.lirah watcher.
export function useArtifacts(projectPath) {
  const { repoRoot } = useRepoRoot(projectPath);
  return { repoRoot, names: useRepoArtifacts(repoRoot) };
}

/** A repo's artifact names, or null while loading. */
export function useRepoArtifacts(repoRoot) {
  const [names, setNames] = useState(null);

  useEffect(() => {
    if (!repoRoot) return undefined;
    let cancelled = false;
    const load = () => listArtifacts(repoRoot).then((n) => !cancelled && setNames(n), () => !cancelled && setNames([]));
    load();
    const dir = `${artifactsRel(repoRoot)}/`;
    // `${rel}/` also matches the repo's folder itself, reported when it's new.
    const unlisten = listen('lirah-files-changed', (e) => { if (e.payload.some((rel) => `${rel}/`.startsWith(dir))) load(); });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [repoRoot]);

  return names;
}

// The list of useArtifacts' artifacts; each opens in the artifact dialog, and
// renames (F2, double-click) or deletes (Del) in place.
export function ArtifactsPane({ projectPath, repoRoot, names }) {
  const dialogs = useDialogStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [renaming, setRenaming] = useState(null);

  if (!projectPath) return <EmptyLine hint="open a project tab to see its artifacts">no project</EmptyLine>;
  if (!names) return <div className="flex justify-center py-4"><Scanner size="md" label="Loading artifacts" /></div>;
  if (names.length === 0) {
    return <EmptyLine hint="agents store HTML pages here with `lirah artifacts add <file.html>`">no artifacts</EmptyLine>;
  }

  const rename = async (name, to) => {
    setRenaming(null);
    if (!to.trim() || artifactName(to) === name) return;
    try {
      await renameArtifact(repoRoot, name, to);
    } catch (e) {
      toast.error(`Rename failed: ${e?.message || e}`);
    }
  };
  const remove = async (name) => {
    const ok = await confirm({ title: `Delete ${name}?`, description: 'The page is removed from ~/.lirah/artifacts.', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await deleteArtifact(repoRoot, name);
    } catch (e) {
      toast.error(`Delete failed: ${e?.message || e}`);
    }
  };
  const hide = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100';

  return (
    <div className="flex flex-col">
      {names.map((name) => {
        const label = name.replace(/\.html$/, '');
        return (
          <div key={name} className="group flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-sidebar-accent/40">
            <View size={12} className="shrink-0 text-muted-foreground" />
            {renaming === name ? (
              <RenameField initial={label} label="Artifact name" onCommit={(to) => rename(name, to)} onCancel={() => setRenaming(null)} />
            ) : (
              <button
                type="button"
                onClick={() => dialogs.open('artifact', { repo: repoRoot, name }, null)}
                onDoubleClick={() => setRenaming(name)}
                onKeyDown={(e) => {
                  if (e.key === 'F2') { e.preventDefault(); setRenaming(name); }
                  if (e.key === 'Delete') { e.preventDefault(); remove(name); }
                }}
                className="min-w-0 flex-1 truncate text-left text-foreground/90 hover:text-foreground cursor-pointer"
                title={`Open ${name} · F2 or double-click to rename · Del to delete`}
              >
                {label}
              </button>
            )}
            <span className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-panel" onClick={() => setRenaming(name)} aria-label={`Rename ${name}`} title="Rename (F2)" className={hide}>
                <Edit />
              </Button>
              <Button variant="ghost" size="icon-panel" onClick={() => remove(name)} aria-label={`Delete ${name}`} title="Delete (Del)" className={hide}>
                <Trash />
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
