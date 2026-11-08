import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogGroup, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { errorMessage } from '../../lib/errorMessage';
import { useTabManager } from '../tabs/TabContext';
import { useToast } from '../toast';
import { useFeatureMap } from './useFeatureMap';
import { markFeatureInTree, selectFeature, togglePinFeature, useTabFeatures } from './useTabFeatures';
import { Fig34Features } from './Fig34Features';
import { copyFeatureFiles, FeatureRow } from './FeaturesPane';

const HOOK_CAP = 40; // files the prompt hook sends per prompt

/** Full-screen, read-only view of the feature map: list, FIG.34 drawing and the selected feature's sheet. */
export function FeatureExplorer({ open, onOpenChange, projectPath, onReveal }) {
  const { activeTabId } = useTabManager();
  const { selectedFeature, pinnedFeatures } = useTabFeatures(activeTabId);
  const fm = useFeatureMap(projectPath);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const filterRef = useRef(null);

  const all = useMemo(
    () => [...(fm.map?.features || [])].sort((a, b) => (b.files?.length || 0) - (a.files?.length || 0)),
    [fm.map],
  );
  const largest = all[0]?.files?.length || 1;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => [f.name, f.id, ...(f.aliases || [])].some((w) => String(w ?? '').toLowerCase().includes(q)));
  }, [all, query]);
  const feature = all.find((f) => f.id === selectedFeature) || null;
  const select = (id) => selectFeature(activeTabId, id);

  // Start on the first feature so the sheet is never empty.
  useEffect(() => {
    if (!feature && all[0]) select(all[0].id);
  }, [feature, all]);

  const move = (step) => {
    if (!shown.length) return;
    const i = shown.findIndex((f) => f.id === selectedFeature);
    select(shown[Math.max(0, Math.min(shown.length - 1, (i < 0 ? -1 : i) + step))].id);
  };
  const pinned = (f) => pinnedFeatures.some((p) => p.id === f.id);
  const togglePin = (f) => togglePinFeature(activeTabId, projectPath, f).catch((e) => toast.error(errorMessage(e)));
  const reveal = (path) => { onOpenChange(false); onReveal?.(path); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="flex flex-col gap-0 overflow-hidden"
        status={`${all.length} features${pinnedFeatures.length ? ` · ${pinnedFeatures.length} in context` : ''}`}
        hints={[{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: feature && pinned(feature) ? 'remove from context' : 'add to context' }]}
        onOpenAutoFocus={(e) => { e.preventDefault(); filterRef.current?.focus(); }}
      >
        <DialogTitle>Features</DialogTitle>
        <DialogDescription className="sr-only">The project's feature map: pick a feature to see its files, what it uses and what uses it.</DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_320px] gap-x-6 2xl:grid-cols-[240px_minmax(0,1fr)_360px] pt-1">
          <nav className="flex min-h-0 flex-col gap-2" aria-label="Features">
            <Input
              ref={filterRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
                if (e.key === 'Enter' && feature) { e.preventDefault(); togglePin(feature); }
              }}
              placeholder="filter by name or alias"
              aria-label="Filter features"
              className="h-7 text-xs"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((f) => (
                <FeatureRow
                  key={f.id}
                  feature={f}
                  largest={largest}
                  selected={f.id === selectedFeature}
                  pinned={pinned(f)}
                  ruler={false}
                  onSelect={() => select(f.id)}
                  onPin={() => togglePin(f)}
                  onCopy={() => copyFeatureFiles(f, toast)}
                />
              ))}
              {!shown.length && <p className="px-2.5 py-1 text-[11px] text-muted-foreground">{all.length ? 'no feature matches' : 'no feature map yet'}</p>}
            </div>
          </nav>

          {/* A floor under the drawing, so a narrow window scrolls it instead of dropping it for the fallback. */}
          <div className="flex min-h-0 flex-col overflow-auto">
            <div className="my-auto" style={{ minWidth: 560 }}>
              <Fig34Features map={fm.map} selected={selectedFeature} pinned={pinnedFeatures} onSelect={select} />
            </div>
          </div>

          <FeatureSheet
            feature={feature}
            all={all}
            pinned={feature && pinned(feature)}
            onPin={() => togglePin(feature)}
            onCopy={() => copyFeatureFiles(feature, toast)}
            onSelect={select}
            onReveal={reveal}
            onMark={() => { markFeatureInTree(activeTabId, Array.isArray(feature.files) ? feature.files : []); onOpenChange(false); }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeatureSheet({ feature, all, pinned, onPin, onCopy, onSelect, onReveal, onMark }) {
  if (!feature) return <div />;
  const files = Array.isArray(feature.files) ? feature.files : [];
  const entries = new Set(feature.entryPoints || []);
  const byId = new Map(all.map((f) => [f.id, f]));
  const uses = (feature.uses || []).filter((id) => byId.has(id) && id !== feature.id);
  const usedBy = all.filter((f) => f.id !== feature.id && (f.uses || []).includes(feature.id)).map((f) => f.id);
  const folders = new Map();
  for (const p of files) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
    folders.set(dir, [...(folders.get(dir) || []), p]);
  }
  const links = (ids) => (ids.length ? ids.map((id) => (
    <button key={id} onClick={() => onSelect(id)} className="text-left underline decoration-dotted underline-offset-2 cursor-pointer hover:text-foreground">
      {byId.get(id).name || id}
    </button>
  )) : <span className="text-muted-foreground">none</span>);

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1 text-xs" aria-label={`${feature.name || feature.id} details`}>
      <header className="flex flex-col gap-1.5">
        {feature.area?.length > 0 && <div className="ins-legend text-[11px] text-muted-foreground">{feature.area.join(' · ')}</div>}
        <h3 className="ins-name text-lg leading-tight text-foreground">{feature.name || feature.id}</h3>
        {feature.description && <p className="text-muted-foreground">{feature.description}</p>}
        <div className="mt-1 flex flex-wrap gap-2">
          <button onClick={onPin} aria-pressed={pinned} title={pinned ? 'Remove from context (↵)' : 'Add to context: its files go with every prompt (↵)'} className="tui-btn">{pinned ? 'in context ×' : 'add to context'}</button>
          <button onClick={onMark} title="Mark its files and folders in the file tree (nothing opens)" className="tui-btn">mark in tree</button>
          <button onClick={onCopy} className="tui-btn">copy files</button>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <DialogGroup label="relations" />
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
          <dt className="text-muted-foreground">triggered by</dt>
          <dd className="text-muted-foreground">{[feature.name, ...(feature.aliases || [])].filter(Boolean).join(' · ')}</dd>
          <dt className="text-muted-foreground">uses</dt>
          <dd className="flex flex-col items-start gap-0.5">{links(uses)}</dd>
          <dt className="text-muted-foreground">used by</dt>
          <dd className="flex flex-col items-start gap-0.5">{links(usedBy)}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <DialogGroup label="files">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {files.length}
            {files.length > HOOK_CAP && <span className="text-[var(--ins-warn)]"> · hook sends {HOOK_CAP}</span>}
            {entries.size > 0 && <span> · ◆ entry point</span>}
          </span>
        </DialogGroup>
        {[...folders].map(([dir, paths]) => (
          <div key={dir} className="flex flex-col">
            <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{dir}/</span>
              <span className="ml-auto tabular-nums text-[var(--ins-faint)]">{paths.length}</span>
            </div>
            {/* Files hang on a dotted guide, like the file tree's meridians. */}
            <div className="ml-1 mt-0.5 border-l border-dotted border-[var(--ins-faint)] pl-2">
              {paths.map((p) => (
                <button key={p} onClick={() => onReveal(p)} title={`show ${p} in the file tree`} className="flex w-full gap-1.5 py-px text-left cursor-pointer hover:text-foreground">
                  <span className="w-2 shrink-0 text-foreground" aria-label={entries.has(p) ? 'entry point' : undefined}>{entries.has(p) ? '◆' : ''}</span>
                  <span className="truncate">{p.slice(p.lastIndexOf('/') + 1)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </aside>
  );
}
