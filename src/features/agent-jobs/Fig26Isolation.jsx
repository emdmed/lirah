import { DASH, Figure, INK, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.26: where a job is allowed to write, as two small sections in FIG.10's
// vocabulary. Isolated: your tree stands untouched while each candidate
// writes in a worktree of its own, branched off beside it. In place: the
// agent writes straight into your tree. The chosen mode is framed in the
// lamp; the other is dashed. Under them, a race's size as the sum it is
// (claude ×2 + codex ×2 = 4), and the warning that jobs auto-approve and
// are not sandboxed. Compact keeps the two sections and their boxes, with
// the words in the tooltip.

const W = 500;
const TOP = 24; // under the FIG label
const SPLIT = 306; // the isolated section's right edge
const RIGHT_X = 316; // the in-place section's left edge
const ROW = 25;
const BOX_H = 19;
const MAX_ROWS = 4;
const MAX_TERMS = 3;

const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/** One worktree per candidate, `copies` of each agent, in pick order. */
export function worktreeRows(clis, copies) {
  const all = clis.flatMap((cli) => Array.from({ length: copies }, () => cli)).map((cli, i) => ({ n: i + 1, cli }));
  if (all.length <= MAX_ROWS) return { rows: all, more: 0 };
  return { rows: all.slice(0, MAX_ROWS - 1), more: all.length - (MAX_ROWS - 1) };
}

function Frame({ x, y, w, h, chosen }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      style={{
        fill: 'none',
        stroke: chosen ? INK.lamp : INK.edgeStrong,
        strokeWidth: chosen ? STROKE.ink : STROKE.hair,
        strokeDasharray: chosen ? undefined : DASH.medium,
      }}
    />
  );
}

function Rect({ x, y, w, h, stroke = INK.edgeStrong, weight = STROKE.hair }) {
  return <rect x={x} y={y} width={w} height={h} style={{ fill: INK.paper, stroke, strokeWidth: weight }} />;
}

/**
 * `isolated` is the chosen mode (useWorktree); `canIsolate` is false outside
 * a git repo. `clis` are the picked agents, `copies` runs of each.
 */
export function Fig26Isolation({ isolated, canIsolate = true, clis, copies = 1, branch, repo, name, fallback = null }) {
  const compact = useFigureCompact();
  const { rows, more } = worktreeRows(clis, isolated ? copies : 1);
  const count = isolated ? clis.length * copies : 1;
  const nRows = rows.length + (more ? 1 : 0);

  const secTop = TOP;
  const innerTop = secTop + (compact ? 10 : 26);
  const treeH = Math.max(compact ? 34 : 64, nRows * ROW - (ROW - BOX_H));
  const secBottom = innerTop + treeH + 10;
  const sumTop = secBottom + 10;
  const race = count > 1;
  const H = compact ? secBottom + 1 : sumTop + 32 + 1;

  // Left section: your tree, then one worktree per candidate beside it.
  const treeX = 12;
  const treeW = 100;
  const wtX = 156;
  const wtW = SPLIT - 10 - wtX;
  const rowY = (i) => innerTop + i * ROW;
  const treeMid = innerTop + treeH / 2;

  // Right section: your tree, written into by the agent.
  const ipTreeX = RIGHT_X + 12;
  const ipTreeW = 116;
  const agentX = ipTreeX + ipTreeW + 10;
  const agentW = W - 4 - agentX;

  const tree = (x, w, chosen, note, noteColor) => (
    <g>
      <Rect x={x} y={innerTop} w={w} h={treeH} stroke={chosen ? INK.fg : INK.edgeStrong} weight={chosen ? STROKE.ink : STROKE.hair} />
      {!compact && (
        <g>
          <T x={x + 7} y={innerTop + 14} color={chosen ? INK.fg : INK.muted}>your tree</T>
          {branch && <T x={x + 7} y={innerTop + 27} color={INK.faint}>{clip(branch, Math.floor((w - 12) / 7))}</T>}
          <T x={x + 7} y={innerTop + treeH - 8} color={chosen ? noteColor : INK.faint}>{note}</T>
        </g>
      )}
    </g>
  );

  const terms = [...clis.slice(0, MAX_TERMS - (clis.length > MAX_TERMS ? 1 : 0))].map((cli) => ({ name: cli, times: copies }));
  if (clis.length > MAX_TERMS) terms.push({ name: `${clis.length - terms.length} more`, times: copies });

  const label = [
    `Where the job writes: ${isolated ? 'isolated worktree' : 'in place'}`,
    isolated
      ? `${count === 1 ? 'one worktree' : `${count} worktrees`} beside your tree, which stays untouched`
      : 'the agent edits your working tree directly',
    race && `race: ${clis.map((c) => `${c} ×${copies}`).join(' + ')} = ${count} candidates`,
    'jobs auto-approve and are not sandboxed',
  ].filter(Boolean).join('; ');

  const runTitle = ['RUN', repo, name].filter(Boolean).map((s) => clip(String(s), 24)).join(' · ');

  return (
    <Figure
      fig="job-isolation"
      title={runTitle || undefined}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 ${TOP - 1} ${W} ${H - TOP + 1}`}
      minWidth={420}
      compactMinWidth={300}
      label={label}
      fallback={fallback}
    >
      {/* Isolated worktree. */}
      <Frame x={0.5} y={secTop} w={SPLIT} h={secBottom - secTop} chosen={isolated} />
      {!compact && (
        <g>
          <T x={10} y={secTop + 16} color={isolated ? INK.lamp : INK.muted}>isolated worktree</T>
          {isolated && <T x={SPLIT - 8} y={secTop + 16} anchor="end" color={INK.lamp}>chosen</T>}
        </g>
      )}
      {tree(treeX, treeW, isolated, 'untouched', INK.fg)}
      {canIsolate ? (
        <g>
          {rows.map((r, i) => {
            const y = rowY(i) + BOX_H / 2;
            const x0 = treeX + treeW;
            return (
              <path
                key={`c${r.n}`}
                d={`M${x0} ${treeMid}C${x0 + 24} ${treeMid} ${wtX - 24} ${y} ${wtX} ${y}`}
                style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
              />
            );
          })}
          {rows.map((r, i) => (
            <g key={r.n}>
              <Rect x={wtX} y={rowY(i)} w={wtW} h={BOX_H} stroke={isolated ? INK.fg : INK.edgeStrong} />
              {!compact && (
                <g>
                  <T x={wtX + 7} y={rowY(i) + 13} color={INK.faint}>{`wt ${r.n}`}</T>
                  <T x={wtX + wtW - 7} y={rowY(i) + 13} anchor="end" color={isolated ? INK.fg : INK.muted}>
                    {clip(r.cli, 12)}
                  </T>
                </g>
              )}
            </g>
          ))}
          {more > 0 && !compact && (
            <T x={wtX + 7} y={rowY(rows.length) + 13} color={INK.muted}>{`+ ${more} more worktrees`}</T>
          )}
        </g>
      ) : (
        !compact && <T x={wtX} y={treeMid + 4} color={INK.faint}>needs a git repo</T>
      )}

      {/* In place. */}
      <Frame x={RIGHT_X} y={secTop} w={W - 0.5 - RIGHT_X} h={secBottom - secTop} chosen={!isolated} />
      {!compact && (
        <g>
          <T x={RIGHT_X + 10} y={secTop + 16} color={!isolated ? INK.lamp : INK.muted}>in place</T>
          {!isolated && <T x={W - 8} y={secTop + 16} anchor="end" color={INK.lamp}>chosen</T>}
        </g>
      )}
      {tree(ipTreeX, ipTreeW, !isolated, 'edited directly', INK.fault)}
      <Rect x={agentX} y={treeMid - BOX_H / 2} w={agentW} h={BOX_H} stroke={!isolated ? INK.fg : INK.edgeStrong} />
      {!compact && <T x={agentX + agentW / 2} y={treeMid + 4} anchor="middle" color={!isolated ? INK.fg : INK.muted}>agent</T>}
      {/* The agent writes into the tree: an arrow onto its edge. */}
      <path
        d={`M${agentX} ${treeMid}H${ipTreeX + ipTreeW + 1}l5 -3v6l-5 -3`}
        style={{ fill: !isolated ? INK.fault : INK.faint, stroke: !isolated ? INK.fault : INK.faint, strokeWidth: STROKE.hair }}
      />

      {/* The race as a sum, and the warning. */}
      {!compact && (
        <g>
          {race && (() => {
            let x = 0.5;
            const parts = [];
            terms.forEach((t, i) => {
              const w = Math.max(textWidth(t.name), textWidth(`× ${t.times}`)) + 16;
              if (i > 0) {
                parts.push(<T key={`p${i}`} x={x + 8} y={sumTop + 20} anchor="middle" color={INK.muted}>+</T>);
                x += 16;
              }
              parts.push(<SumBox key={t.name} x={x} y={sumTop} w={w} top={t.name} bottom={`× ${t.times}`} />);
              x += w;
            });
            const result = `${count} candidates`;
            const rw = textWidth(result) + 16;
            parts.push(<T key="eq" x={x + 9} y={sumTop + 20} anchor="middle" color={INK.muted}>=</T>);
            parts.push(<SumBox key="race" x={x + 18} y={sumTop} w={rw} top="race" bottom={result} strong />);
            return parts;
          })()}
          <T x={W} y={sumTop + 13} anchor="end" color={INK.fault}>auto-approve</T>
          <T x={W} y={sumTop + 26} anchor="end" color={INK.fault}>no sandbox</T>
        </g>
      )}
    </Figure>
  );
}

function SumBox({ x, y, w, top, bottom, strong = false }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={32}
        style={{ fill: INK.paper, stroke: strong ? INK.fg : INK.edgeStrong, strokeWidth: STROKE.hair }}
      />
      <T x={x + 8} y={y + 13} color={INK.muted}>{top}</T>
      <T x={x + 8} y={y + 26} color={INK.fg}>{bottom}</T>
    </g>
  );
}
