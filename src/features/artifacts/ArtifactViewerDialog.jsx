import { useState, useEffect, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { ChevronLeft, ChevronRight, Edit, Plan, Trash } from '@/components/icons';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogEmpty } from '../../components/ui/dialog';
import { Scanner } from '../../components/instrument/Scanner';
import { Position } from '../../components/instrument/Position';
import { artifactsRel } from '../../lib/lirahPaths';
import { artifactPath, deleteArtifact, listArtifacts, renameArtifact } from './artifactFiles';
import { isProjectTab, useTabManager } from '../tabs/TabContext';
import { resolveRepoRoot } from '../plans/planRepoRoot';
import { attachOnPlanning, startDraft } from '../planning/planningModeStore';
import { basename } from '../../utils/pathUtils';
import { useConfirm } from '../dialogs/DialogProvider';
import { useToast } from '../toast';
import { RenameField } from '../tabs/RenameField';

/**
 * A repo's HTML artifact (~/.lirah/artifacts/<repo>/<name>.html) in a
 * full-size dialog, stepping through the repo's other artifacts.
 * The page runs in a sandboxed iframe without allow-same-origin, so its
 * scripts get an opaque origin and can't reach the app or Tauri.
 * @param {string} repo - Repo root the artifact belongs to
 * @param {string} name - File name, e.g. "report.html"
 * @param {function} onNameChange - Called with another artifact's name to show it
 */
export const ArtifactViewerDialog = memo(function ArtifactViewerDialog({ open, onOpenChange, repo, name, onNameChange }) {
  const [html, setHtml] = useState(null);
  const [names, setNames] = useState([]);
  const [error, setError] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const { workspaceTabs: tabs, activeTabId, switchTab } = useTabManager();
  // Bumped when the file changes on disk, to re-read it.
  const [version, setVersion] = useState(0);

  const dir = repo ? artifactsRel(repo) : null;

  useEffect(() => {
    if (!open || !dir) return undefined;
    const unlisten = listen('lirah-files-changed', (e) => {
      if (e.payload.some((rel) => rel.startsWith(`${dir}/`))) setVersion((v) => v + 1);
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, [open, dir]);

  useEffect(() => {
    if (!open || !dir || !name) return undefined;
    let cancelled = false;
    Promise.all([invoke('store_read_text', { rel: `${dir}/${name}` }), listArtifacts(repo)])
      .then(([text, all]) => {
        if (cancelled) return;
        setHtml(text);
        setNames(all);
        setError(text === null ? 'This artifact was deleted.' : null);
      })
      .catch((err) => { if (!cancelled) setError(String(err?.message ?? err)); });
    return () => { cancelled = true; };
  }, [open, dir, repo, name, version]);

  const index = names.indexOf(name);
  const hasMultiple = names.length > 1 && index >= 0;
  const goTo = useCallback((i) => { if (names[i]) onNameChange?.(names[i]); }, [names, onNameChange]);

  useEffect(() => {
    if (!open || !hasMultiple) return undefined;
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || (e.key !== '[' && e.key !== ']')) return;
      e.preventDefault();
      goTo(index + (e.key === '[' ? -1 : 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasMultiple, goTo, index]);

  const rename = async (to) => {
    setRenaming(false);
    if (!to.trim()) return;
    try {
      onNameChange?.(await renameArtifact(repo, name, to));
    } catch (e) {
      toast.error(`Rename failed: ${e?.message || e}`);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${name}?`, description: 'The page is removed from ~/.lirah/artifacts.', confirmLabel: 'Delete' }))) return;
    try {
      await deleteArtifact(repo, name);
      // Show a neighbour, or close once the last one is gone.
      const next = names[index + 1] ?? names[index - 1];
      if (next) onNameChange?.(next);
      else onOpenChange(false);
    } catch (e) {
      toast.error(`Delete failed: ${e?.message || e}`);
    }
  };

  // A draft named after the artifact, in its project's tab (the active one if it is), with the artifact attached.
  const planFrom = async () => {
    try {
      const roots = await Promise.all(tabs.map((t) => (isProjectTab(t) ? resolveRepoRoot(t.projectPath).catch(() => null) : null)));
      const matching = tabs.filter((_, i) => roots[i] === repo);
      const tab = matching.find((t) => t.id === activeTabId) ?? matching[0];
      if (!tab) throw new Error(`Open a tab in ${basename(repo)} to plan from this artifact`);
      const words = name.replace(/\.html$/, '').replace(/[-_]+/g, ' ').trim();
      attachOnPlanning(tab.id, [await artifactPath(repo, name)]);
      await startDraft(tab.id, words.charAt(0).toUpperCase() + words.slice(1), repo);
      switchTab(tab.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.message || String(e));
    }
  };

  const loading = html === null && !error;
  const hints = hasMultiple
    ? [{ keys: ['^', '['], label: 'prev artifact' }, { keys: ['^', ']'], label: 'next artifact' }]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      size="full"
      status={hasMultiple ? <Position index={index} count={names.length} /> : null}
      lamp={loading ? 'blink' : error ? 'fault' : 'on'}
      hints={hints}
      className="flex flex-col gap-0 px-0"
    >
      <DialogTitle>{name || 'Artifact'}</DialogTitle>
      <DialogDescription className="sr-only">HTML artifact {name} for {repo}</DialogDescription>

      <div className="flex items-center justify-between gap-2 px-3 pb-2 edge-b-engraved flex-shrink-0">
        {renaming ? (
          <RenameField initial={name.replace(/\.html$/, '')} label="Artifact name" onCommit={rename} onCancel={() => setRenaming(false)} />
        ) : (
          <div className="flex-1 min-w-0 font-mono text-xs text-muted-foreground truncate">~/.lirah/{dir}/{name}</div>
        )}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={planFrom} aria-label="Plan from this artifact">
                <Plan size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Plan from this: a draft in planning mode, with the artifact in context</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => setRenaming(true)} aria-label="Rename artifact">
                <Edit size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rename</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Delete artifact">
                <Trash size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
        {hasMultiple && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => goTo(index - 1)} aria-label="Previous artifact">
                  <ChevronLeft size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous artifact (Ctrl+[)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={index === names.length - 1} onClick={() => goTo(index + 1)} aria-label="Next artifact">
                  <ChevronRight size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next artifact (Ctrl+])</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {error ? (
          <div className="p-4 text-center text-destructive">
            <p>Failed to load artifact</p>
            <p className="text-xs mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center p-8"><Scanner size="lg" /></div>
        ) : !html.trim() ? (
          <DialogEmpty className="justify-center p-8">This artifact is empty.</DialogEmpty>
        ) : (
          // Never add allow-same-origin: with it, the page's scripts could call the app's IPC.
          <iframe title={name} sandbox="allow-scripts" srcDoc={html} className="w-full h-full border-0 bg-white" />
        )}
      </div>
    </DialogContent>
    </Dialog>
  );
});
