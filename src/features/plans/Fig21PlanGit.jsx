import { useLayoutEffect, useRef, useState } from 'react';
import { DASH, Figure, INK, Node, STROKE, T, textWidth } from '@/components/instrument/figure';
import { basename } from '../../utils/pathUtils';
import { shortcutKeys } from '../../lib/shortcuts';
import { CHUNK_STATUS, planProgress } from './planModel';
import { chunkCommitsByRepo, planGit, workPath } from './planGit';

// FIG.21: where a plan's commits went. Per repo, the base lane with the
// branch point, the plan branch above it with one filled node per chunk that
// committed there (numbered by its Plan-Chunk), and a dotted tail to a box
// saying where the work happens: in place or the worktree folder. Once every
// chunk is done a lamp box says the branch is ready to merge.

const MIN_W = 260;
const MAX_W = 560;
const LANE_H = 64; // branch label, branch lane, chunk numbers, base lane
const LANE_GAP = 10;
const MAX_LANES = 3;
const TOP = 20; // under the FIG label

/** Long names lose their middle, not their end: the end tells plan-a from plan-b. */
export function middleTruncate(text, max = 36) {
  if (text.length <= max) return text;
  if (max < 2) return '…';
  const keep = max - 1;
  const head = Math.ceil(keep * 0.45);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}

// A worktree path in at most `max` chars: under ~, then without the plan's
// folder (~/.lirah/plan-worktrees/…/repo), then just the repo folder.
export function shortWorkPath(path, max) {
  const i = path.indexOf('/.lirah/');
  const tilde = i >= 0 ? `~${path.slice(i)}` : path;
  const repo = tilde.slice(tilde.lastIndexOf('/') + 1);
  const options = [tilde, `~/.lirah/plan-worktrees/…/${repo}`, `~/…/${repo}`];
  return options.find((o) => o.length <= max && (o === tilde || tilde.includes('/plan-worktrees/')))
    ?? `…/${middleTruncate(repo, Math.max(1, max - 2))}`;
}

/**
 * The figure's data, pure: per repo (primary first), the base, where it is
 * worked, and the chunk numbers that committed there, in plan order.
 */
export function planGitLanes(plan) {
  const cfg = planGit(plan);
  const lanes = cfg.repos.map((repo) => ({
    root: repo.root,
    base: repo.base || 'HEAD',
    worktree: cfg.worktrees && workPath(repo) !== repo.root ? workPath(repo) : null,
    chunks: plan.chunks
      .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && chunkCommitsByRepo(plan, c)[repo.root]?.length > 0)
      .map((c) => c.n),
  }));
  const { done, total } = planProgress(plan);
  return { branch: cfg.branch.trim(), multi: lanes.length > 1, lanes, ready: total > 0 && done === total };
}

function OneLineBox({ x, y, width, text, color = INK.muted, stroke = INK.edgeStrong, title }) {
  return (
    <g>
      {title && <title>{title}</title>}
      <rect x={x} y={y} width={width} height={19} style={{ fill: INK.paper, stroke, strokeWidth: STROKE.hair }} />
      <T x={x + 7} y={y + 13} color={color}>{text}</T>
    </g>
  );
}

// Every chunk number when they fit, else every k-th plus the last.
function labelStep(nums, spacing) {
  const room = textWidth(String(Math.max(...nums))) + 5;
  let step = 1;
  while (step * spacing < room) step += 1;
  return step;
}

function Lane({ lane, y, width, leftW, branch, label }) {
  const branchY = y + 28;
  const baseY = y + 56;
  const bp = leftW + 10;
  const maxBox = Math.max(textWidth('worktree · ~/…/x') + 14, Math.floor(width * 0.55));
  const maxChars = Math.floor((maxBox - 14) / textWidth('x'));
  const boxText = lane.worktree
    ? `worktree · ${shortWorkPath(lane.worktree, maxChars - 'worktree · '.length)}`
    : 'in place · no worktree';
  const boxW = textWidth(boxText) + 14;
  const boxX = width - boxW;

  const n = lane.chunks.length;
  const nx0 = bp + 14;
  const nx1 = boxX - 20;
  const spacing = n > 1 ? Math.min(24, (nx1 - nx0) / (n - 1)) : 0;
  const xAt = (i) => nx0 + i * spacing;
  const size = n > 1 ? Math.max(3, Math.min(8, spacing - 2)) : 8;
  const tailFrom = n > 0 ? xAt(n - 1) : bp;
  const step = n > 0 ? labelStep(lane.chunks, spacing || 99) : 1;
  // With no plan branch the work lands on the base itself: one lane.
  const onBase = !branch;

  return (
    <g>
      <T x={bp} y={y + 11} color={label.strong ? INK.fg : INK.muted}>{label.text}</T>

      {/* Base lane and the branch point. */}
      <T x={0} y={baseY + 4}>{middleTruncate(lane.base, Math.floor(leftW / textWidth('x')))}</T>
      <line x1={leftW + 4} x2={width} y1={baseY} y2={baseY} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {!onBase && (
        <>
          <path
            d={`M${bp} ${baseY}V${branchY + 6}Q${bp} ${branchY} ${bp + 6} ${branchY}H${tailFrom}`}
            style={{ fill: 'none', stroke: INK.fg, strokeWidth: STROKE.ink }}
          />
          <Node x={bp} y={baseY} state="merge" size={7} />
        </>
      )}
      {onBase && (
        <line x1={bp} x2={tailFrom} y1={branchY} y2={branchY} style={{ stroke: INK.fg, strokeWidth: STROKE.ink }} />
      )}

      {/* Dotted tail to where the work happens. */}
      <line
        x1={tailFrom}
        x2={boxX}
        y1={branchY}
        y2={branchY}
        style={{ stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.sparse }}
      />
      <OneLineBox x={boxX} y={branchY - 9.5} width={boxW} text={boxText} title={lane.worktree || lane.root} />

      {lane.chunks.map((num, i) => (
        <g key={num}>
          <Node x={xAt(i)} y={branchY} state="done" size={size} />
          {(i % step === 0 || i === n - 1) && (i === n - 1 || (n - 1 - i) * spacing >= textWidth(String(num)) + 5) && (
            <T x={xAt(i)} y={branchY + 16} anchor="middle" color={INK.faint}>{num}</T>
          )}
        </g>
      ))}
    </g>
  );
}

/** The drawing and its height at a given width, pure so it can be rendered headless. */
export function fig21Layout({ plan, width }) {
  const d = planGitLanes(plan);
  const shown = d.lanes.slice(0, MAX_LANES);
  const more = d.lanes.length - shown.length;
  const leftW = Math.min(textWidth('x') * 12, Math.max(...shown.map((l) => textWidth(l.base))));
  const branch = d.branch || 'current branch';
  const maxChars = Math.floor((width - leftW - 10) / textWidth('x'));

  let y = TOP;
  const parts = shown.map((lane, i) => {
    // One repo: the branch names the lane. Several: each lane is its repo,
    // and the first (the primary) also carries the branch.
    const text = d.multi
      ? `${basename(lane.root)}${i === 0 ? ` · ${branch}` : ''}`
      : branch;
    const el = (
      <Lane
        key={lane.root}
        lane={lane}
        y={y}
        width={width}
        leftW={leftW}
        branch={d.branch}
        label={{ text: middleTruncate(text, maxChars), strong: !d.multi && !!d.branch }}
      />
    );
    y += LANE_H + LANE_GAP;
    return el;
  });
  y -= LANE_GAP;

  if (more > 0) {
    y += 14;
    parts.push(<T key="more" x={0} y={y}>{`+${more} repo${more === 1 ? '' : 's'}`}</T>);
  }

  if (d.ready) {
    const keys = (shortcutKeys('merge') ?? ['alt', 'M']).join(' ').toLowerCase();
    const text = `ready · ${keys} to merge`;
    const w = textWidth(text) + 14;
    y += 8;
    parts.push(
      <g key="ready" style={{ filter: `drop-shadow(0 0 3px ${INK.lamp})` }}>
        <OneLineBox x={width - w} y={y} width={w} text={text} color={INK.lamp} stroke={INK.lamp} />
      </g>,
    );
    y += 19;
  }

  return { height: y + 4, drawing: <g>{parts}</g> };
}

/**
 * The locked git summary as a drawing, laid out at its container's width.
 * Narrower than MIN_W, or in compact figures, it shows `fallback` (the text rows).
 */
export function Fig21PlanGit({ plan, fallback }) {
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.max(MIN_W, Math.min(MAX_W, Math.floor(rootW ?? 320)));
  const { height, drawing } = fig21Layout({ plan, width });
  const d = planGitLanes(plan);
  const label = `Plan branch ${d.branch || 'current branch'}: ${d.lanes
    .map((l) => `${basename(l.root)} ${l.chunks.length} chunk${l.chunks.length === 1 ? '' : 's'} committed${l.worktree ? ', in a worktree' : ', in place'}`)
    .join('; ')}${d.ready ? '; ready to merge' : ''}`;

  return (
    <div ref={rootRef} className="min-w-0">
      <Figure
        fig="plan-git"
        viewBox={`0 0 ${width} ${height}`}
        minWidth={MIN_W}
        paper="var(--ins-panel)"
        label={label}
        fallback={fallback}
      >
        {drawing}
      </Figure>
    </div>
  );
}
