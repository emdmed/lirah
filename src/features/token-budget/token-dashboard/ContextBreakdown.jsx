import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Scanner } from '@/components/instrument/Scanner';
import { Meter } from '@/components/instrument/Meter';
import { EmptyState } from '@/components/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatTokenCount } from '../tokenCalculations';
import { getContextFill } from '../../../config/models';
import { useContextBreakdown } from '../useContextBreakdown';
import { CONTEXT_GROUPS as GROUPS, groupColor, sharePct as pct, shortLabel } from '../contextGroups';

function shortPath(path, projectPath) {
  if (!path) return '';
  if (projectPath && path.startsWith(projectPath + '/')) return path.slice(projectPath.length + 1);
  const home = path.match(/^\/home\/[^/]+|^\/Users\/[^/]+/)?.[0];
  return home ? '~' + path.slice(home.length) : path;
}

function Bar({ value, max, color }) {
  const w = max > 0 ? Math.max((value / max) * 100, 0.5) : 0;
  return (
    <span className="block h-[3px] w-full bg-[var(--ins-edge)]" aria-hidden="true">
      <span className="block h-full" style={{ width: `${w}%`, backgroundColor: color }} />
    </span>
  );
}

function Section({ title, aside, className, children }) {
  return (
    <div className={cn('bg-background rounded-none edge-engraved p-3 flex flex-col min-h-0', className)}>
      <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
        <div className="text-xs font-medium">{title}</div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function ContextBreakdown({ tokenUsage, projectPath, palette = {} }) {
  const sessionFile = tokenUsage?.session_file;
  const { breakdown, loading, error } = useContextBreakdown(sessionFile, tokenUsage?.context_tokens, true);
  const [group, setGroup] = useState(null);
  const [view, setView] = useState('items');

  const colorOf = useMemo(() => (g) => groupColor(palette, g), [palette]);

  const total = breakdown?.total_tokens || 0;
  const fill = getContextFill({ ...tokenUsage, context_tokens: total, last_model: breakdown?.model || tokenUsage?.last_model });

  const items = useMemo(() => {
    const list = breakdown?.items || [];
    return (group ? list.filter((i) => i.group === group) : list).slice(0, 150);
  }, [breakdown, group]);
  const itemMax = items[0]?.tokens || 0;

  const files = breakdown?.files || [];
  const fileMax = files.reduce((m, f) => Math.max(m, f.read_tokens + f.write_tokens), 0);
  const tools = breakdown?.tools || [];

  if (!sessionFile) {
    return <EmptyState title="No Claude session in this tab" description="Start claude in this tab to see what fills its context" />;
  }
  if (error) {
    return <EmptyState title="Couldn't read the session" description={error} />;
  }
  if (!breakdown) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        <Scanner size="md" className="mr-2" />
        Reading session…
      </div>
    );
  }
  if (!total) {
    return <EmptyState title="Nothing in context yet" description="The breakdown appears after Claude's first reply" />;
  }

  const sourceNote = breakdown.source === 'request'
    ? `rebuilt from request ${breakdown.request_index} of ${breakdown.request_count} · ${breakdown.message_count} messages`
    : `estimated from the transcript (this Claude Code version doesn't log requests) · ${breakdown.message_count} messages`;

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Summary */}
      <div className="shrink-0 flex flex-col gap-2">
        <div className="flex items-baseline gap-3 text-xs flex-wrap">
          <span className="text-lg font-bold tabular-nums">{formatTokenCount(total)}</span>
          <span className="text-muted-foreground">
            tokens in context{fill ? ` · ${pct(total, fill.max)} of ${formatTokenCount(fill.max)}` : ''}
          </span>
          {fill && <Meter value={total} max={fill.max} readout={false} label="Context window" className="w-40" />}
          <span className="text-muted-foreground ml-auto flex items-center gap-2">
            {loading && <Scanner label="Updating" />}
            {sourceNote}
            {!tokenUsage?.tab_bound && ' · latest project session'}
          </span>
        </div>

        {/* Stacked bar */}
        <div className="flex h-3 w-full overflow-hidden edge-engraved" role="img" aria-label="Context by source">
          {breakdown.groups.map((g) => (
            <button
              type="button"
              key={g.group}
              title={`${GROUPS[g.group]?.label || g.group}: ${formatTokenCount(g.tokens)} (${pct(g.tokens, total)})`}
              onClick={() => setGroup((cur) => (cur === g.group ? null : g.group))}
              className={cn('h-full', group && group !== g.group && 'opacity-30')}
              style={{ width: `${(g.tokens / total) * 100}%`, backgroundColor: colorOf(g.group) }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-3 min-h-0">
        {/* Sources + tools */}
        <div className="flex flex-col gap-3 min-h-0">
          <Section title="By source" aside={group && (
            <button type="button" className="ins-key ins-key-panel ins-round text-[10px] px-1.5" onClick={() => setGroup(null)}>all</button>
          )}>
            <div className="flex flex-col">
              {breakdown.groups.map((g) => {
                const meta = GROUPS[g.group] || { label: g.group, hint: '' };
                return (
                  <button
                    type="button"
                    key={g.group}
                    onClick={() => setGroup((cur) => (cur === g.group ? null : g.group))}
                    className={cn('flex items-center gap-2 px-1 py-1 text-xs text-left', group === g.group && 'ins-row-selected')}
                    title={meta.hint}
                    aria-pressed={group === g.group}
                  >
                    <span className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(g.group) }} />
                    <span className="flex-1 truncate">{meta.label}</span>
                    <span className="text-muted-foreground tabular-nums">{pct(g.tokens, total)}</span>
                    <span className="w-14 text-right tabular-nums">{formatTokenCount(g.tokens)}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="By tool" className="flex-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-0.5 text-xs overflow-auto min-h-0">
              <span className="text-muted-foreground">tool</span>
              <span className="text-muted-foreground text-right">calls</span>
              <span className="text-muted-foreground text-right">inputs</span>
              <span className="text-muted-foreground text-right">results</span>
              {tools.map((t) => (
                <div key={t.name} className="contents">
                  <span className="truncate">{t.name}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{t.calls}</span>
                  <span className="text-right tabular-nums">{formatTokenCount(t.input_tokens)}</span>
                  <span className="text-right tabular-nums">{formatTokenCount(t.result_tokens)}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Items / files */}
        <Section
          className="col-span-2"
          title={view === 'items'
            ? (group ? `Largest in ${GROUPS[group]?.label || group}` : 'Largest pieces')
            : `Files (${files.length})`}
          aside={(
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="h-6">
                <TabsTrigger value="items" className="text-[11px] px-2 font-mono">Pieces</TabsTrigger>
                <TabsTrigger value="files" className="text-[11px] px-2 font-mono">Files</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        >
          <div className="flex-1 overflow-auto min-h-0">
            {view === 'items' && (
              <ul className="flex flex-col">
                {items.map((it, i) => (
                  <li key={i} className="py-1 flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(it.group) }} />
                      <span className="shrink-0 text-muted-foreground">{it.kind}</span>
                      <span className="flex-1 truncate" title={it.label}>{shortLabel(it.label, projectPath)}</span>
                      <span className="w-14 shrink-0 text-right tabular-nums">{formatTokenCount(it.tokens)}</span>
                    </div>
                    <Bar value={it.tokens} max={itemMax} color={colorOf(it.group)} />
                  </li>
                ))}
              </ul>
            )}
            {view === 'files' && (
              files.length === 0 ? (
                <EmptyState title="No files read or written" />
              ) : (
                <ul className="flex flex-col">
                  {files.map((f) => (
                    <li key={f.path} className="py-1 flex flex-col gap-0.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-1 truncate" title={f.path}>{shortPath(f.path, projectPath)}</span>
                        {f.reads > 0 && (
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            read{f.reads > 1 ? ` ×${f.reads}` : ''} {formatTokenCount(f.read_tokens)}
                          </span>
                        )}
                        {f.writes > 0 && (
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            wrote{f.writes > 1 ? ` ×${f.writes}` : ''} {formatTokenCount(f.write_tokens)}
                          </span>
                        )}
                        <span className="w-14 shrink-0 text-right tabular-nums">{formatTokenCount(f.read_tokens + f.write_tokens)}</span>
                      </div>
                      <Bar value={f.read_tokens + f.write_tokens} max={fileMax} color={colorOf(f.read_tokens >= f.write_tokens ? 'results' : 'calls')} />
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
