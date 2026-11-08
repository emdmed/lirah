import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { errorMessage } from '../../lib/errorMessage';
import { useTabManager } from '../tabs/TabContext';
import { useToast } from '../toast';
import { useFeatureMap } from './useFeatureMap';
import { pinFeature, selectFeature, unpinFeature, useTabFeatures } from './useTabFeatures';
import { Fig34Features } from './Fig34Features';
import { copyFeatureFiles, FeatureRow } from './FeaturesPane';

const BTN = 'tui-btn text-[11px] text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-default';
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
  const togglePin = (f) => (pinned(f)
    ? unpinFeature(activeTabId, f.id)
    : pinFeature(activeTabId, projectPath, f).catch((e) => toast.error(errorMessage(e))));
  const reveal = (path) => { onOpenChange(false); onReveal?.(path); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="flex flex-col gap-0 overflow-hidden"
        status={`${all.length} features`}
        hints={[{ keys: ['↑', '↓'], label: 'move' }]}
        onOpenAutoFocus={(e) => { e.preventDefault(); filterRef.current?.focus(); }}
      >
        <DialogTitle>Features</DialogTitle>
        <DialogDescription className="sr-only">The project's feature map: pick a feature to see its files, what it uses and what uses it.</DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_320px] gap-x-5 pt-1">
          <nav className="flex min-h-0 flex-col gap-2" aria-label="Features">
            <Input
              ref={filterRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
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
                  onSelect={() => select(f.id)}
                  onPin={() => togglePin(f)}
                  onCopy={() => copyFeatureFiles(f, toast)}
                />
              ))}
              {!shown.length && <p className="px-2.5 py-1 text-[11px] text-muted-foreground">{all.length ? 'no feature matches' : 'no feature map yet'}</p>}
            </div>
          </nav>

          <div className="min-h-0 overflow-auto">
            <Fig34Features map={fm.map} selected={selectedFeature} pinned={pinnedFeatures} onSelect={select} />
          </div>

          <FeatureSheet
            feature={feature}
            all={all}
            pinned={feature && pinned(feature)}
            onPin={() => togglePin(feature)}
            onCopy={() => copyFeatureFiles(feature, toast)}
            onSelect={select}
            onReveal={reveal}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeatureSheet({ feature, all, pinned, onPin, onCopy, onSelect, onReveal }) {
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
    <button key={id} onClick={() => onSelect(id)} className="mr-2 underline decoration-dotted cursor-pointer hover:text-foreground">
      {byId.get(id).name || id}
    </button>
  )) : <span className="text-muted-foreground">none</span>);

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto text-xs" aria-label={`${feature.name || feature.id} details`}>
      <div>
        {feature.area?.length > 0 && <div className="text-[11px] text-muted-foreground">{feature.area.join(' · ')}</div>}
        <h3 className="text-sm text-foreground">{feature.name || feature.id}</h3>
        {feature.description && <p className="mt-1 text-muted-foreground">{feature.description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onPin} aria-pressed={pinned} className={cn(BTN, pinned && 'text-[var(--ins-lamp)]')}>{pinned ? 'in context' : 'add to context'}</button>
        <button disabled title="comes with the file tree marks" className={BTN}>mark in tree</button>
        <button onClick={onCopy} className={BTN}>copy files</button>
      </div>
      <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt className="text-muted-foreground">triggered by</dt>
        <dd>{[feature.name, ...(feature.aliases || [])].filter(Boolean).join(', ')}</dd>
        <dt className="text-muted-foreground">uses</dt>
        <dd>{links(uses)}</dd>
        <dt className="text-muted-foreground">used by</dt>
        <dd>{links(usedBy)}</dd>
      </dl>
      <div>
        <div className="text-muted-foreground">
          {files.length} file{files.length === 1 ? '' : 's'}
          {files.length > HOOK_CAP && <span className="text-[var(--ins-warn)]"> · hook sends {HOOK_CAP}</span>}
        </div>
        {[...folders].map(([dir, paths]) => (
          <div key={dir} className="mt-2">
            <div className="text-[11px] text-muted-foreground">{dir}/</div>
            {paths.map((p) => (
              <button key={p} onClick={() => onReveal(p)} title={`show ${p} in the file tree`} className="flex w-full gap-1.5 pl-2 text-left cursor-pointer hover:text-foreground">
                <span className="w-2 text-[var(--ins-lamp)]" aria-label={entries.has(p) ? 'entry point' : undefined}>{entries.has(p) ? '◆' : ''}</span>
                <span className="truncate">{p.slice(p.lastIndexOf('/') + 1)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
