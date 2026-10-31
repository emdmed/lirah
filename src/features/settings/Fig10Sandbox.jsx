import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CalRecipe, Calibrated } from '@/components/instrument/calibrated';
import { tabDisplayName, useTabManager } from '../tabs/TabContext';
import { useBookmarks } from '../bookmarks';

// FIG.10: what the sandbox lets this tab's terminal touch, drawn from the
// live bwrap spec as the calibrated section recipe. The dashed boundary is
// the sandbox, labelled with network isolation and the unshared namespaces.
// Inside it the system root is hatched (read-only); home is clear (writable)
// with the protected dotfiles as closed islands; the project folder is the
// heavy outline; private /tmp is dotted. Callouts on the right name each
// region; the last, in lamp, is what the sandbox does not cover. Compact, or
// narrower than the drawing, shows `fallback`.

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

/**
 * The sandbox drawn for this tab. `fallback` is what a narrow host or a
 * failed spec call shows. `paper` matches the host surface.
 */
export function Fig10Sandbox({ projectPath, networkIsolation, ...rest }) {
  const spec = useSandboxSpec(projectPath, networkIsolation);
  const tabName = useActiveTabName();
  if (!spec) return rest.fallback ?? null;
  return <Fig10Drawing spec={spec} tabName={tabName} {...rest} />;
}

const W = 460;
const MAX_ISLANDS = 6;
const ISLAND_H = 17;
const ISLAND_GAP = 6;

const tw = (s) => Calibrated.textWidth(s);
const clip = (s, px) => {
  if (tw(s) <= px) return s;
  let t = s;
  while (t.length > 1 && tw(`${t}…`) > px) t = t.slice(0, -1);
  return `${t}…`;
};

// Islands flowed left to right inside [x0, right], wrapping; past six, the
// rest are one "+k" island (they are protected dotfiles too).
function layoutIslands(names, x0, right, y0) {
  const shown = names.slice(0, MAX_ISLANDS);
  const extra = names.length - shown.length;
  const labels = extra > 0 ? [...shown, `+${extra}`] : shown;
  const out = [];
  let x = x0;
  let y = y0;
  for (const label of labels) {
    const w = tw(label) + 10;
    if (x > x0 && x + w > right) { x = x0; y += ISLAND_H + ISLAND_GAP; }
    out.push({ x, y, w, kind: 'island', label });
    x += w + ISLAND_GAP;
  }
  return { islands: out, bottom: labels.length ? y + ISLAND_H : y0 };
}

/** The section-recipe data for a spec, pure. */
export function sandboxSection(spec) {
  const [home = null, ...rest] = spec.writable ?? [];
  const project = rest[0] ?? null;
  const tilde = (p) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p);
  const projectInHome = !!(project && home && project.startsWith(`${home}/`));
  const dotfiles = (spec.protected ?? []).map((p) => tilde(p).replace(/^~\//, ''));
  const unshared = ['pid', 'ipc', 'uts'].filter((n) => spec.unshare?.includes(n)).join(' ');
  const kept = spec.env_passthrough?.length ?? 0;

  const callouts = [
    { l1: 'read-only', l2: dotfiles.length ? `/ · ${dotfiles.length} dotfiles` : '/' },
    { l1: 'writable', l2: [home && '~', project && 'project'].filter(Boolean).join(' · ') || 'nothing' },
    { l1: 'cleared env', l2: spec.cleared_env ? `keeps ${kept} if set` : 'inherited' },
    { l1: 'outside', l2: 'term 2, jobs', live: true },
  ];
  // The recipe's callout column: as wide as the widest box, at the right edge.
  const boxW = Math.max(112, ...callouts.map((c) => Calibrated.K.boxWidth(c.l1, c.l2)));
  const colX = W - boxW - 2;
  const bRight = colX - 12; // the boundary's right edge

  const root = { x: 20, y: 38, right: bRight - 12 };
  const home$ = { x: root.x + 14, y: root.y + 28, right: root.right - 14 };
  const inner = { x: home$.x + 10, right: home$.right - 10 };
  const regions = [];
  let y = home$.y + 26;
  const isl = layoutIslands(dotfiles, inner.x, inner.right, y);
  y = isl.bottom + 8;
  const projectLabel = project ? clip(tilde(project), inner.right - inner.x - 16) : '';
  let projectRegion = null;
  if (project && projectInHome) {
    projectRegion = { x: inner.x, y, w: inner.right - inner.x, h: 40, kind: 'strong', label: projectLabel, sub: 'read-write' };
    y += 40 + 10;
  }
  const homeBottom = home ? Math.max(y, home$.y + 40) : home$.y;
  y = home ? homeBottom + 10 : home$.y;
  if (project && !projectInHome) {
    projectRegion = { x: home$.x, y, w: home$.right - home$.x, h: 40, kind: 'strong', label: projectLabel, sub: 'read-write' };
    y += 40 + 10;
  }
  const tmp = spec.tmp_private ? { x: home$.x, y, w: tw('/tmp private') + 16, h: 22, kind: 'dotted', label: '/tmp private' } : null;
  if (tmp) y += 22 + 10;
  const rootBottom = y;

  regions.push({ x: root.x, y: root.y, w: root.right - root.x, h: rootBottom - root.y, kind: 'hatch', label: '/ root' });
  if (home) {
    regions.push({ x: home$.x, y: home$.y, w: home$.right - home$.x, h: homeBottom - home$.y, kind: 'clear', label: '~ home' });
    regions.push(...isl.islands);
  }
  if (projectRegion) regions.push(projectRegion);
  if (tmp) regions.push(tmp);

  // Leaders: root's right edge, home's right edge, and the boundary.
  callouts[0].at = [root.right - 6, root.y + 12];
  if (home) callouts[1].at = [home$.right - 6, home$.y + 30];
  if (spec.cleared_env) callouts[2].at = [bRight, 40 + 2 * 54 + 16];

  const boundary = [spec.net_isolated && 'network isolated', unshared].filter(Boolean).join(' · ');
  const h = Math.max(rootBottom + 36, 40 + 3 * 54 + 32 + 26);

  const label = [
    'Sandbox for this tab',
    'root read-only',
    home && 'home writable',
    dotfiles.length && `${dotfiles.length} protected dotfiles: ${dotfiles.join(', ')}`,
    project && `project ${tilde(project)} writable`,
    spec.tmp_private && 'private /tmp',
    spec.cleared_env && 'environment cleared',
    spec.net_isolated && 'network isolated',
    unshared && `unshared ${unshared}`,
    'not covered: secondary terminal, background jobs',
  ].filter(Boolean).join(', ').concat('.');

  return { w: W, h, boundary: boundary ? { label: boundary } : {}, regions, callouts, label };
}

/** FIG.10 for a given spec (pure: no fetching), so it can be rendered alone. */
export function Fig10Drawing({ spec, tabName, fallback = null, paper, className }) {
  const data = sandboxSection(spec);
  const name = tabName || 'this tab';
  const title = `sandbox · ${name.length > 20 ? `${name.slice(0, 19)}…` : name} · bubblewrap`;
  return (
    <div className={className} title={data.label}>
      <CalRecipe recipe="section" title={title} data={data} minWidth={400} paper={paper} fallback={fallback} />
    </div>
  );
}
