import { Lamp } from '@/components/instrument/Lamp';
import { Scanner } from '@/components/instrument/Scanner';
import { useTheme } from '@/contexts/ThemeContext';
import { formatTokenCount } from './tokenCalculations';
import { useContextBreakdown } from './useContextBreakdown';
import { CONTEXT_GROUPS, groupColor, groupLabel, sharePct, shortLabel } from './contextGroups';

const TOP_GROUPS = 5;
const TOP_ITEMS = 3;

// The short version of the context breakdown, for the context meter's menu:
// a bar of what the used context is made of, the largest sources, the three
// largest pieces, and a verdict when the context is heavy. The meter it opens
// from already shows how full the window is. Mounts only while the menu is
// open, so it reads the session only then.
export function ContextPeek({ tokenUsage, projectPath, heavy }) {
  const { theme } = useTheme();
  const palette = theme?.terminal;
  const { breakdown, error } = useContextBreakdown(tokenUsage?.session_file, tokenUsage?.context_tokens, true);

  if (!tokenUsage?.session_file) {
    return <p className="px-2 py-2 text-muted-foreground"># no Claude session in this tab</p>;
  }
  if (error) {
    return (
      <p className="px-2 py-2 text-muted-foreground break-words" title={error}>
        # couldn't read the session: {error}. Reopen this menu to try again.
      </p>
    );
  }
  if (!breakdown) {
    return (
      <p className="px-2 py-2 flex items-center gap-2 text-muted-foreground">
        <Scanner label="Reading session" />reading session…
      </p>
    );
  }

  const total = breakdown.total_tokens;
  if (!total) {
    return <p className="px-2 py-2 text-muted-foreground"># nothing in context yet</p>;
  }
  // One order everywhere: the bar reads left to right as the list reads down.
  const groups = breakdown.groups.slice().sort((a, b) => b.tokens - a.tokens);
  const shown = groups.slice(0, TOP_GROUPS);
  const rest = groups.slice(TOP_GROUPS);
  const restTokens = rest.reduce((n, g) => n + g.tokens, 0);
  const items = breakdown.items.slice(0, TOP_ITEMS);
  const color = (g) => groupColor(palette, g);

  return (
    <div className="px-2 pb-1 flex flex-col gap-2 font-mono tabular-nums">
      <SourceBar groups={groups} total={total} color={color} />

      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between pb-0.5">
          <span className="ins-legend">Sources</span>
          <span className="text-faint">share of {formatTokenCount(total)} used</span>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-0.5">
          {shown.map((g) => (
            <div key={g.group} className="contents" title={CONTEXT_GROUPS[g.group]?.hint || undefined}>
              <Swatch color={color(g.group)} />
              <span className="truncate">{groupLabel(g.group)}</span>
              <span className="text-muted-foreground text-right">{sharePct(g.tokens, total)}</span>
              <span className="w-[6ch] text-right">{formatTokenCount(g.tokens)}</span>
            </div>
          ))}
          {rest.length > 0 && (
            <div className="contents text-muted-foreground" title={rest.map((g) => groupLabel(g.group)).join(', ')}>
              <span />
              <span className="truncate">+{rest.length} more</span>
              <span className="text-right">{sharePct(restTokens, total)}</span>
              <span className="w-[6ch] text-right">{formatTokenCount(restTokens)}</span>
            </div>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-2 edge-t-engraved">
          <span className="ins-legend pb-0.5">Largest pieces</span>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0.5">
            {items.map((it, i) => {
              const name = it.label ? displayLabel(it.label, projectPath) : it.kind;
              return (
                <div key={`${it.kind}:${it.label}:${i}`} className="contents">
                  <Swatch color={color(it.group)} />
                  <span className="truncate" title={it.label || it.kind}>{name}</span>
                  <span className="text-muted-foreground truncate max-w-[12ch]">{it.label ? it.kind.toLowerCase() : ''}</span>
                  <span className="w-[6ch] text-right">{formatTokenCount(it.tokens)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {heavy && shown[0] && (
        <p className="flex items-center gap-2 pt-2 edge-t-engraved text-[var(--ins-warn)]" role="status">
          <Lamp state="warn" />
          <span className="text-foreground">
            Heavy context · largest source: {groupLabel(shown[0].group).toLowerCase()} ({sharePct(shown[0].tokens, total)})
          </span>
        </p>
      )}
    </div>
  );
}

// What the used context is made of: the full width is the used tokens, split
// by source in the list's order. A 1px gap keeps neighbouring hues apart.
function SourceBar({ groups, total, color }) {
  return (
    <div className="flex h-2.5 w-full gap-px overflow-hidden" aria-hidden="true">
      {groups.map((g) => (
        <span
          key={g.group}
          className="h-full min-w-px"
          style={{ flexGrow: g.tokens / total, flexBasis: 0, backgroundColor: color(g.group) }}
        />
      ))}
    </div>
  );
}

function Swatch({ color }) {
  return <span className="w-1.5 h-1.5 shrink-0" style={{ backgroundColor: color }} />;
}

// Paths relative to the project, the home directory as ~, and long paths cut
// in the middle so the file name stays visible.
function displayLabel(label, projectPath) {
  let s = shortLabel(label, projectPath);
  const home = projectPath?.match(/^(\/home\/[^/]+|\/Users\/[^/]+)/)?.[1];
  if (home) s = s.split(home + '/').join('~/');
  if (s.includes('/') && s.length > 34) {
    const tail = s.slice(s.lastIndexOf('/'));
    const keep = Math.max(34 - tail.length - 1, 6);
    s = `${s.slice(0, keep)}…${tail.length > 26 ? '…' + tail.slice(-25) : tail}`;
  }
  return s;
}
