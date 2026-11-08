import { useEffect, useMemo, useState } from 'react';
import { MoreHoriz } from 'iconoir-react';
import '@/components/instrument/calibrated';
import { useCalSvg } from '@/components/instrument/useCalSvg';
import { useFigureCompact } from '@/components/instrument/figure';
import { Scanner } from '../../components/instrument/Scanner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { formatAgo, formatTimer } from '../../lib/formatDuration';
import { errorMessage } from '../../lib/errorMessage';
import { useTick } from '../../hooks/useTick';
import { useTabManager } from '../tabs/TabContext';
import { useToast } from '../toast';
import { useDialog } from '../dialogs/DialogProvider';
import { EmptyPlate } from '../../components/EmptyState';
import { Fig35Freshness } from './Fig35Freshness';
import { markFeatureInTree, selectFeature, togglePinFeature, useTabFeatures } from './useTabFeatures';

const BTN = 'tui-btn text-[11px] text-muted-foreground hover:text-foreground cursor-pointer';

export function copyFeatureFiles(f, toast) {
  navigator.clipboard.writeText((f.files || []).join('\n'))
    .then(() => toast.success(`Copied ${f.files?.length || 0} paths`), (e) => toast.error(errorMessage(e)));
}

/** The FEATURES section: the map's state on top, then its features by file count. `fm` is useFeatureMap(projectPath). */
export function FeaturesPane({ projectPath, fm }) {
  const { activeTabId } = useTabManager();
  const { selectedFeature, pinnedFeatures } = useTabFeatures(activeTabId);
  const toast = useToast();
  const dialog = useDialog();
  // This pane sits outside the tab's dialog scope, so open into the tab by id.
  const explore = () => dialog.open('featureExplorer', {}, activeTabId);
  const { reload } = fm;
  // The map can change outside the app (an agent, a CLI build), so re-read it when the tab opens.
  useEffect(reload, [reload]);

  const build = (rebuild) => {
    try {
      fm.build(rebuild).catch(() => {}); // the failed status line shows the error
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const features = useMemo(
    () => [...(fm.map?.features || [])].sort((a, b) => (b.files?.length || 0) - (a.files?.length || 0)),
    [fm.map],
  );
  const largest = features[0]?.files?.length || 1;
  const togglePin = (f) => togglePinFeature(activeTabId, projectPath, f).catch((e) => toast.error(errorMessage(e)));

  // While this tab is open the tree marks the selected feature; leaving it clears them.
  const markFiles = features.find((f) => f.id === selectedFeature)?.files;
  useEffect(() => {
    if (!Array.isArray(markFiles)) return undefined;
    markFeatureInTree(activeTabId, markFiles);
    return () => markFeatureInTree(activeTabId, null);
  }, [activeTabId, markFiles]);

  return (
    <div
      className="flex flex-col outline-none"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && fm.map && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
          e.preventDefault();
          explore();
        }
        // p on a row adds the feature to the prompt or takes it out, as p pins a file in the tree.
        const id = e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.closest?.('[data-feature-id]')?.dataset.featureId;
        const f = id && features.find((x) => x.id === id);
        if (f) { e.preventDefault(); togglePin(f); }
      }}
    >
      <StatusLine fm={fm} onBuild={build} onExplore={explore} />
      {features.map((f) => (
        <FeatureRow
          key={f.id}
          feature={f}
          largest={largest}
          selected={selectedFeature === f.id}
          pinned={pinnedFeatures.some((p) => p.id === f.id)}
          onSelect={() => selectFeature(activeTabId, selectedFeature === f.id ? null : f.id)}
          onPin={() => togglePin(f)}
          onCopy={() => copyFeatureFiles(f, toast)}
          onExplore={() => { selectFeature(activeTabId, f.id); explore(); }}
        />
      ))}
    </div>
  );
}

function StatusLine({ fm, onBuild, onExplore }) {
  const { status, map } = fm;
  if (status === 'none') {
    return (
      <EmptyPlate
        title="no feature map yet"
        description="an agent groups the project's files into features"
        action={{ label: 'map features', onClick: () => onBuild(true) }}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-[11px] text-muted-foreground">
      {status === 'building' && <Building />}
      {status === 'fresh' && <span>built {map.gitSha || '?'} · {map.generatedAt ? `${formatAgo(Date.now() - map.generatedAt)} ago` : 'unknown age'}</span>}
      {status === 'stale' && (
        <>
          <Fig35Freshness
            gitSha={map.gitSha}
            head={fm.head}
            commitsBehind={fm.commitsBehind}
            newFiles={fm.newFiles}
            missingFiles={fm.missingFiles}
            fallback={<span className="text-[var(--ins-warn)]">{fm.commitsBehind || 0} commits behind · {fm.newFiles || 0} new files{fm.missingFiles > 0 ? ` · ${fm.missingFiles} missing` : ''}</span>}
          />
          <button onClick={() => onBuild(false)} className={BTN}>update</button>
          <button onClick={() => onBuild(true)} className={BTN}>rebuild</button>
        </>
      )}
      {status === 'failed' && (
        <>
          <span className="text-[var(--ins-fault)] wrap-anywhere">{fm.error}</span>
          {map && <span>the old map is still in use</span>}
          <button onClick={() => onBuild(!map)} className={BTN}>retry</button>
        </>
      )}
      {map && <button onClick={onExplore} className={cn(BTN, 'ml-auto')} title="explore the map (f)">explore ⤢</button>}
    </div>
  );
}

// shortcut: elapsed counts from when this pane saw the build start, so it resets
// if the pane remounts mid-build; store the start in useFeatureMap if that matters.
function Building() {
  const [start] = useState(() => Date.now());
  const now = useTick(true);
  return <><Scanner label="building the feature map" /><span>building · {formatTimer(now - start)}</span></>;
}

/** A feature row; a pinned feature's name is inverse video (it is in the prompt). `ruler={false}` prints the count bare. */
export function FeatureRow({ feature, largest, selected, pinned, ruler = true, onSelect, onPin, onCopy, onExplore }) {
  const count = feature.files?.length || 0;
  const name = String(feature.name || feature.id);
  return (
    <div data-feature-id={feature.id} className={cn('group flex items-center gap-2 px-2.5 py-1 text-[11px]', selected ? 'bg-sidebar-accent text-foreground' : 'hover:bg-sidebar-accent/40')}>
      <button onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
        <span className="min-w-0 flex-1 truncate" title={feature.description || name}>
          <span className={cn(pinned && 'bg-foreground px-1 text-background')}>{name}</span>
        </span>
        {ruler ? <CountRuler count={count} max={largest} /> : <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>}
      </button>
      <button
        onClick={onPin}
        aria-pressed={!!pinned}
        aria-label={pinned ? `Remove ${name} from context` : `Add ${name} to context`}
        title={pinned ? 'Remove from context (p)' : 'Add to context: its files go with every prompt (p)'}
        className={cn(
          'w-3 shrink-0 text-center leading-none cursor-pointer text-muted-foreground hover:text-foreground focus-visible:opacity-100',
          !pinned && !selected && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        {pinned ? '×' : '+'}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label={`Actions for ${name}`}>
            <MoreHoriz className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onPin} className="cursor-pointer text-xs">{pinned ? 'remove from context' : 'add to context'}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopy} className="cursor-pointer text-xs">copy file list</DropdownMenuItem>
          {onExplore && <DropdownMenuItem onSelect={onExplore} className="cursor-pointer text-xs">explore</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// The file count as the spanRow dimension line (the jobs list's duration
// ruler), scaled to the map's largest feature.
function CountRuler({ count, max }) {
  const compact = useFigureCompact();
  const text = `${count}`;
  const ref = useCalSvg('spanRow', { ms: count, max, tone: 'done', text, compact, track: 60, gap: 6, valueW: 24, label: `${count} files` });
  return (
    <span className="cal" style={{ display: 'block', flexShrink: 0 }} title={`${count} files`}>
      <svg ref={ref} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }} />
    </span>
  );
}
