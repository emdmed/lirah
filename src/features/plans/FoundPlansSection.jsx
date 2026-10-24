import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { Scanner } from '../../components/instrument/Scanner';
import { useConfirm } from '../dialogs/DialogProvider';
import { useToast } from '../toast';

/** `*_plan.md` files at the repo root, one key away from becoming plans. */
export function FoundPlansSection({ files, importFile }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [moveOut, setMoveOut] = useState(false);
  const [busy, setBusy] = useState(null); // path being imported, or 'all'

  if (files.length === 0) return null;

  const run = async (list, key) => {
    if (moveOut) {
      const ok = await confirm({
        title: list.length === 1 ? `Import and delete ${list[0].name}?` : `Import and delete ${list.length} plan files?`,
        description: 'The plans move to ~/.lirah/plans and the files are deleted from the repo root.',
        confirmLabel: 'Import and delete',
      });
      if (!ok) return;
    }
    setBusy(key);
    try {
      for (const file of list) await importFile(file, { deleteOriginal: moveOut });
    } catch (e) {
      toast.error(`Import failed: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col edge-b-engraved pb-1">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 text-[10px] text-muted-foreground">
        <span className="engraved-label">found in repo</span>
        <span className="font-mono tabular-nums">{files.length}</span>
        <label
          className="ml-auto flex items-center gap-1.5"
          title="Delete each file from the repo root after importing it"
        >
          delete originals
          <ToggleSwitch checked={moveOut} onChange={setMoveOut} label="Delete originals after import" tone="warn" />
        </label>
      </div>
      {files.map((file) => (
        <div key={file.path} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-foreground" title={file.path}>{file.name}</span>
            <span className="truncate text-[10px] text-muted-foreground">
              {file.state === 'changed' ? 'changed since import' : file.title || 'untitled'}
            </span>
          </div>
          {busy === file.path ? (
            <Scanner />
          ) : (
            <PanelButton
              icon={FileDown}
              onClick={() => run([file], file.path)}
              disabled={!!busy}
              title={file.state === 'changed' ? 'Re-import and split again' : 'Import and split into chunks'}
            >
              {file.state === 'changed' ? 're-import' : 'import'}
            </PanelButton>
          )}
        </div>
      ))}
      {files.length > 1 && (
        <PanelButton onClick={() => run(files, 'all')} disabled={!!busy} className="mx-3 my-1 self-start">
          {busy === 'all' ? <Scanner /> : null}
          import all ({files.length})
        </PanelButton>
      )}
    </div>
  );
}
