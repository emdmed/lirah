import { AgentMark } from '../../components/file-tree/AgentMark';
import { markKey } from '../../components/file-tree/useAgentFileActivity';
import { useFileSelection } from '../file-groups';
import { shortcutKeys } from '../../lib/shortcuts';
import { cn } from '../../lib/utils';
import { ZenDrawer } from './ZenDrawer';

// Files agents edited or read this turn under `root`, edits first. A row click
// selects the file into the prompt context, as a click in the files pane does.
// `files` is useAgentFileActivity's map; `root` has no trailing slash.
export function FilesDrawer({ files, root }) {
  const { selectedFiles, toggleFileSelection } = useFileSelection();
  const rows = [...files]
    .filter(([path]) => path.startsWith(`${root}/`))
    .sort(([a, m], [b, n]) => (m.kind === n.kind ? a.localeCompare(b) : m.kind === 'edit' ? -1 : 1));

  return (
    <ZenDrawer id="files" title="files" keys={shortcutKeys('zen-files')} className="w-[28rem]">
      {rows.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">nothing touched this turn</div>}
      {rows.map(([path, mark]) => (
        <button
          key={path}
          type="button"
          aria-pressed={selectedFiles.has(path)}
          className={cn(
            'flex h-6 w-full min-w-0 items-center gap-1 px-2 text-left font-mono text-xs focus-ring hover:bg-accent/15',
            selectedFiles.has(path) ? 'text-foreground bg-accent/15' : 'text-muted-foreground',
          )}
          title={selectedFiles.has(path) ? 'Remove from the prompt context' : 'Add to the prompt context'}
          onClick={() => toggleFileSelection(path)}
        >
          <span className="min-w-0 flex-1 truncate">{path.slice(root.length + 1)}</span>
          <AgentMark mark={markKey(mark)} />
        </button>
      ))}
    </ZenDrawer>
  );
}
