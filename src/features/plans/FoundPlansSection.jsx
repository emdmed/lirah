import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Scanner } from '../../components/instrument/Scanner';
import { plural } from '../../lib/plural';
import { useToast } from '../toast';

// "smooth_improvements_plan.md" + "Smooth Improvements Plan: Performance pass"
// → "Performance pass": the title without the words the filename already says.
function titleBeyondName(title, name) {
  if (!title) return '';
  const stem = name.replace(/\.md$/i, '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  if (!title.toLowerCase().startsWith(stem)) return title;
  const rest = title.slice(stem.length).replace(/^[\s:—–-]+/, '');
  return rest || title;
}

/** `*_plan.md` files at the repo root, one key away from becoming plans. */
export function FoundPlansSection({ files, importFile, deleteFile }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null); // path being imported, or 'all'

  if (files.length === 0) return null;

  // Import first; deleting the file is offered afterwards, once the plan is in.
  const run = async (list, key) => {
    setBusy(key);
    const done = [];
    try {
      for (const file of list) {
        await importFile(file);
        done.push(file);
      }
    } catch (e) {
      toast.error(`Import failed: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
    // A re-chunked plan keeps its file: it's what the next revision edits.
    const imported = done.filter((f) => f.state !== 'changed');
    if (done.length > imported.length) toast.success(`Re-chunking ${plural(done.length - imported.length, 'plan')}`);
    if (imported.length === 0) return;
    toast.success(imported.length === 1 ? `Imported ${imported[0].name}` : `Imported ${plural(imported.length, 'plan')}`, {
      duration: 10000, // long enough to decide on the delete
      action: {
        label: imported.length === 1 ? 'delete file' : `delete ${plural(imported.length, 'file')}`,
        onClick: async () => {
          try {
            for (const file of imported) await deleteFile(file);
          } catch (e) {
            toast.error(`Could not delete: ${e?.message || e}`);
          }
        },
      },
    });
  };

  return (
    <div className="flex flex-col edge-b-engraved pb-1">
      <div className="flex items-center gap-2 px-3 pt-2.5 text-[11px] text-muted-foreground">
        <span className="engraved-label">found in repo</span>
        <span className="font-mono tabular-nums">{files.length}</span>
      </div>
      <div className="px-3 pb-1 text-[11px] text-muted-foreground"># plan files at the repo root</div>
      {files.map((file) => {
        const changed = file.state === 'changed';
        const title = titleBeyondName(file.title, file.name);
        return (
          <div key={file.path} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-foreground" title={file.title || file.name}>{title || file.name}</span>
              <span className="truncate text-[11px] text-muted-foreground" title={file.path}>
                {file.name}{changed && ' · updated'}
              </span>
            </div>
            {busy === file.path ? (
              <Scanner />
            ) : (
              <PanelButton
                icon={FileDown}
                onClick={() => run([file], file.path)}
                disabled={!!busy}
                title={changed ? 'Take the edited file and re-chunk what isn\'t done yet' : 'Import and split into chunks'}
              >
                {changed ? 're-chunk' : 'import'}
              </PanelButton>
            )}
          </div>
        );
      })}
      {files.length > 1 && (
        <PanelButton onClick={() => run(files, 'all')} disabled={!!busy} className="mx-3 my-1 self-start">
          {busy === 'all' ? <Scanner /> : null}
          import all ({files.length})
        </PanelButton>
      )}
    </div>
  );
}
