import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, DASH, Figure, Hatch, INK, Leader, STROKE, T, textWidth } from '@/components/instrument/figure';
import { tabDisplayName, useTabManager } from '../tabs/TabContext';
import { useBookmarks } from '../bookmarks';

// FIG.10: what the sandbox lets this tab's terminal touch, drawn from the
// live bwrap spec. The dashed line is the sandbox. Inside it, the system root
// is hatched (read-only); home is clear (writable) with the protected
// dotfiles as hatched islands; the project folder is ink-framed. Callouts on
// the right name each region; the last one, outside the boundary, is what
// the sandbox does not cover.

/** The bwrap spec for a tab, or null while loading or if the command fails. */
export function useSandboxSpec(projectDir, noNet) {
  const [spec, setSpec] = useState(null);
  useEffect(() => {
    let live = true;
    invoke('get_sandbox_spec', { projectDir: projectDir || null, noNet: !!noNet })
      .then((s) => { if (live) setSpec(s); })
      .catch(() => { if (live) setSpec(null); });
    return () => { live = false; };
  }, [projectDir, noNet]);
  return spec;
}

/** The active tab's name, as the tab bar shows it. */
function useActiveTabName() {
  const { tabs, activeTabId } = useTabManager();
  const { bookmarks } = useBookmarks();
  const tab = tabs.find((t) => t.id === activeTabId);
  return tab ? tabDisplayName(tab, bookmarks) : null;
}

const W = 460;
const BX = 300; // boundary right edge; callouts sit past it
const CX = 316; // callout column
const CW = W - CX;
const ROOT = { x: 10, inset: 14 }; // home sits 14 in from the root
const PAD = 8;
const ISLAND_H = 19;
const MAX_ISLANDS = 6;

const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);

// Text on a hatched or dashed line gets paper behind it so it reads.
function Plate({ x, y, text, color = INK.fg }) {
  return (
    <g>
      <rect x={x - 3} y={y - 11} width={textWidth(text) + 6} height={15} style={{ fill: INK.paper }} />
      <T x={x} y={y} color={color}>{text}</T>
    </g>
  );
}

// A protected dotfile: hatched rim, clear middle, its name inside.
function Island({ x, y, name }) {
  const w = textWidth(name) + 16;
  return (
    <g>
      <Hatch x={x} y={y} width={w} height={ISLAND_H} gap={3} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={ISLAND_H - 6} style={{ fill: INK.paper }} />
      <T x={x + 8} y={y + 13} color={INK.fg}>{name}</T>
    </g>
  );
}

// Islands flowed left to right, wrapping at `right`; past six, a "+k" count.
function layoutIslands(names, x0, right, y0) {
  const shown = names.slice(0, MAX_ISLANDS);
  const extra = names.length - shown.length;
  const items = [];
  let x = x0;
  let y = y0;
  for (const name of shown) {
    const w = textWidth(name) + 16;
    if (x > x0 && x + w > right) { x = x0; y += ISLAND_H + 6; }
    items.push({ name, x, y });
    x += w + 6;
  }
  let more = null;
  if (extra > 0) {
    const text = `+${extra}`;
    if (x + textWidth(text) > right) { x = x0; y += ISLAND_H + 6; }
    more = { text, x, y: y + 13 };
  }
  return { items, more, bottom: names.length ? y + ISLAND_H : y0 };
}

/**
 * The sandbox drawn for this tab. `fallback` is what compact mode, a narrow
 * host or a failed spec call shows. `paper` matches the host surface.
 */
export function Fig10Sandbox({ projectPath, networkIsolation, ...rest }) {
  const spec = useSandboxSpec(projectPath, networkIsolation);
  const tabName = useActiveTabName();
  if (!spec) return rest.fallback ?? null;
  return <Fig10Drawing spec={spec} tabName={tabName} {...rest} />;
}

/** FIG.10 for a given spec (pure: no fetching), so it can be rendered alone. */
export function Fig10Drawing({ spec, tabName, fallback = null, paper, className }) {

  const [home = null, ...rest] = spec.writable ?? [];
  const project = rest[0] ?? null;
  const tilde = (p) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p);
  const projectInHome = !!(project && home && project.startsWith(`${home}/`));
  const dotfiles = (spec.protected ?? []).map((p) => tilde(p).replace(/^~\//, ''));

  // Left: boundary ⊃ root ⊃ home ⊃ islands + project, then /tmp in root.
  const bTop = 24;
  const rootX = ROOT.x;
  const rootW = BX - 2 * ROOT.x;
  const rootTop = bTop + 8;
  const homeX = rootX + ROOT.inset;
  const homeW = rootW - 2 * ROOT.inset;
  const homeTop = rootTop + 22;
  const islandX = homeX + PAD;
  const islandRight = homeX + homeW - 16; // keep a clear strip for the writable dot
  const isl = layoutIslands(dotfiles, islandX, islandRight, homeTop + 20);
  const projectText = project ? clip(tilde(project), Math.floor((homeW - 2 * PAD - 14) / textWidth('x'))) : '';
  let y = isl.bottom + PAD;
  const projectBox = project && projectInHome ? { x: islandX, y, w: homeW - 2 * PAD } : null;
  if (projectBox) y += ISLAND_H + PAD;
  const homeBottom = home ? Math.max(y + 2, homeTop + 30) : homeTop;
  y = homeBottom + PAD;
  const outsideBox = project && !projectInHome ? { x: homeX, y, w: homeW } : null;
  if (outsideBox) y += ISLAND_H + PAD;
  const tmpY = spec.tmp_private ? y : null;
  if (spec.tmp_private) y += ISLAND_H + PAD;
  const rootBottom = y + 2;
  const bBottom = rootBottom + 8;

  // Right: four callouts, leaders level with their middles.
  const CALL_H = 32;
  const CALL_GAP = 8;
  const callY = (i) => rootTop + i * (CALL_H + CALL_GAP);
  const H = Math.max(bBottom, callY(3) + CALL_H) + 2;

  const unshared = ['pid', 'ipc', 'uts'].filter((n) => spec.unshare?.includes(n)).join(' ');
  const kept = spec.env_passthrough?.length ?? 0;
  const roValue = dotfiles.length ? `/ · ${dotfiles.length} dotfiles` : '/';
  const rwValue = [home && '~', project && 'project'].filter(Boolean).join(' · ') || 'nothing';
  const title = `SANDBOX · ${clip(tabName || 'this tab', 20)} · BUBBLEWRAP`;

  const label = [
    'Sandbox for this tab',
    'root read-only',
    home && 'home writable',
    dotfiles.length && `${dotfiles.length} protected dotfiles: ${dotfiles.join(', ')}`,
    project && `project ${tilde(project)} writable`,
    spec.tmp_private && 'private /tmp',
    spec.cleared_env && 'environment cleared',
    spec.net_isolated && 'network isolated',
    'not covered: secondary terminal, background jobs',
  ].filter(Boolean).join(', ');

  const leaderTo = (i, x) => {
    const cy = callY(i) + CALL_H / 2;
    return <Leader points={[[x, cy], [CX, cy]]} />;
  };

  return (
    <Figure
      fig="sandbox"
      title={title}
      viewBox={`0 0 ${W} ${H}`}
      minWidth={400}
      fallback={fallback}
      label={label}
      paper={paper}
      className={className}
    >
      {/* The sandbox boundary. */}
      <rect
        x={0.5}
        y={bTop}
        width={BX - 0.5}
        height={bBottom - bTop}
        style={{ fill: 'none', stroke: INK.edgeStrong, strokeWidth: STROKE.ink, strokeDasharray: DASH.medium }}
      />
      {spec.net_isolated && (
        <g>
          <rect x={BX - 132} y={bTop - 7} width={124} height={14} style={{ fill: INK.paper }} />
          <path
            d={`M${BX - 126} ${bTop - 4}l7 7m0 -7l-7 7`}
            style={{ fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.emphasis, filter: `drop-shadow(0 0 3px ${INK.lamp})` }}
          />
          <T x={BX - 112} y={bTop + 4} color={INK.lamp}>network isolated</T>
        </g>
      )}

      {/* Root: read-only, so hatched. */}
      <Hatch x={rootX} y={rootTop} width={rootW} height={rootBottom - rootTop} />
      <Plate x={rootX + 6} y={rootTop + 15} text="/ root" />

      {/* Home: writable, so clear, with the protected dotfiles hatched in it. */}
      {home && (
        <g>
          <rect
            x={homeX}
            y={homeTop}
            width={homeW}
            height={homeBottom - homeTop}
            style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
          />
          <T x={homeX + PAD} y={homeTop + 13} color={INK.fg}>~ home</T>
          {isl.items.map((it) => <Island key={it.name} {...it} />)}
          {isl.more && <T x={isl.more.x} y={isl.more.y}>{isl.more.text}</T>}
        </g>
      )}

      {/* The project folder, framed in ink: where the agent works. */}
      {(projectBox || outsideBox) && (() => {
        const b = projectBox || outsideBox;
        return (
          <g>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={ISLAND_H}
              style={{ fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.ink }}
            />
            <T x={b.x + 7} y={b.y + 13} color={INK.fg}>{projectText}</T>
          </g>
        );
      })()}

      {/* Private /tmp and the unshared namespaces. */}
      {tmpY != null && (
        <g>
          <rect
            x={homeX}
            y={tmpY}
            width={textWidth('/tmp private') + 14}
            height={ISLAND_H}
            style={{ fill: INK.paper, stroke: INK.muted, strokeWidth: STROKE.hair, strokeDasharray: DASH.sparse }}
          />
          <T x={homeX + 7} y={tmpY + 13} color={INK.fg}>/tmp private</T>
          {unshared && <Plate x={homeX + textWidth('/tmp private') + 28} y={tmpY + 13} text={unshared} color={INK.muted} />}
        </g>
      )}

      {/* Callouts. */}
      {leaderTo(0, rootX + rootW - ROOT.inset / 2)}
      <Box x={CX} y={callY(0)} width={CW} label="read-only" value={roValue} />
      {home && leaderTo(1, homeX + homeW - 8)}
      <Box x={CX} y={callY(1)} width={CW} label="writable" value={rwValue} />
      {spec.cleared_env && leaderTo(2, BX)}
      <Box
        x={CX}
        y={callY(2)}
        width={CW}
        label="cleared env"
        value={spec.cleared_env ? `keeps ${kept} if set` : 'inherited'}
      />
      <Box x={CX} y={callY(3)} width={CW} label="outside" value="term 2, jobs" valueColor={INK.lamp} stroke={INK.lamp} />
    </Figure>
  );
}
