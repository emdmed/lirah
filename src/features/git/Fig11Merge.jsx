import { plural } from '../../lib/plural';
import { Cmd, DASH, Dim, Figure, INK, Leader, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.11: what the merge will do to the history. The base lane on top, the
// feature lane below it from the fork point. A fast-forward slides the base
// pointer straight along to the feature tip; a merge commit joins the two
// lanes at a diamond. Each numbered command sits at the node it acts on, with
// the same numbers as the "Will run" block below the figure. Compact keeps
// the two lanes, their nodes and the join, closer together; the names, the
// outcome, the counts and the commands move to the tooltip.

// The exact git commands confirm() will run, so nothing happens unseen.
export function planCommands({ feature, base, plan }) {
  const where = plan.switchNeeded ? '' : `(in ${plan.mergeDir}) `;
  const cmds = [];
  if (plan.switchNeeded) cmds.push(`git switch ${base}`);
  cmds.push(plan.ff
    ? `${where}git merge --ff-only ${feature}`
    : `${where}git merge --no-ff -m "Merge branch '${feature}' into ${base}" ${feature}`);
  if (plan.featureWorktree) cmds.push(`git worktree remove ${plan.featureWorktree}`);
  return cmds;
}

const W = 640;
const LANE_X = 88; // lanes start after the branch names
const FX = 110; // fork point: the commit both branches share
const STEP = 22; // node spacing
const BASE_Y = 78;
const FULL_FEAT_Y = 124;
const DIM_Y = 144;
const ROW = [36, 56]; // command rows above the base lane
const ROW_BELOW = 172; // command row below the feature lane
const MAX_BEHIND = 3;
const MAX_AHEAD = 8;
const C_FEAT_Y = BASE_Y + 22; // compact: the lanes closer together

const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);

// A command at column x on row y, clipped to what fits before the right edge.
function Step({ x, y, n, command, from }) {
  const bx = x - 7;
  const room = Math.floor((W - bx - 20) / textWidth('x')) - 2;
  const below = from < y;
  return (
    <g>
      <Leader points={[[x, below ? from + 6 : from - 6], [x, below ? y - 10 : y + 4]]} dot={false} />
      <Cmd x={bx} y={y} n={n} command={clip(command, room)} />
    </g>
  );
}

// A one-line tag right-aligned on x, outlined and written in one tone.
function Tag({ x, y, text, color }) {
  const w = textWidth(text) + 14;
  return (
    <g>
      <rect x={x - w} y={y} width={w} height={19} style={{ fill: INK.paper, stroke: color, strokeWidth: STROKE.hair }} />
      <T x={x - w + 7} y={y + 13} color={color}>{text}</T>
    </g>
  );
}

/** The merge plan drawn; `fallback` is what a narrow dialog shows. */
export function Fig11Merge({ feature, base, plan, fallback }) {
  const compact = useFigureCompact();
  const { ff, behind = 0, ahead = plan.commits.length, diffStat } = plan;
  const FEAT_Y = compact ? C_FEAT_Y : FULL_FEAT_Y;

  // Number the commands exactly as planCommands lists them.
  const cmds = planCommands({ feature, base, plan });
  let i = 0;
  const switchCmd = plan.switchNeeded ? { n: ++i, text: cmds[i - 1] } : null;
  const mergeCmd = { n: ++i, text: cmds[i - 1] };
  const removeCmd = plan.featureWorktree ? { n: ++i, text: cmds[i - 1] } : null;

  // Base lane: the fork, then up to three commits made on base since.
  const shownBehind = Math.min(behind, MAX_BEHIND);
  const behindXs = Array.from({ length: shownBehind }, (_, j) => FX + STEP * (j + 1));
  const baseLastX = behindXs.length ? behindXs[behindXs.length - 1] : FX;

  // Feature lane: one node per commit; past eight, the last one is the tip
  // and the rest are counted in a gap before it.
  const hidden = Math.max(0, ahead - MAX_AHEAD);
  const more = hidden ? `… +${hidden}` : '';
  const gapW = hidden ? (compact ? 14 : textWidth(more) + 10) : 0;
  const F0 = FX + 24;
  const featXs = Array.from({ length: Math.min(ahead, MAX_AHEAD) }, (_, j) => (
    F0 + STEP * j + (hidden && j === MAX_AHEAD - 1 ? gapW : 0)
  ));
  const tipX = featXs[featXs.length - 1] ?? F0;
  const behindLabel = behind > 0 && !compact ? `+${behind} since branch` : '';
  const behindLabelX = FX + STEP - 4;
  // The join clears the feature tip, base's last commit and its label.
  const joinX = ff ? tipX : Math.max(tipX + 40, baseLastX + 40, behindLabel ? behindLabelX + textWidth(behindLabel) + 14 : 0);

  // Commits dimension, then the diff stat boxed at its end.
  const dimLabel = plural(ahead, 'commit');
  const dimFits = tipX - F0 > textWidth(dimLabel) + 20;
  const dimEnd = dimFits ? tipX : tipX + 8 + textWidth(dimLabel);
  const stat = diffStat == null ? null
    : diffStat.files === 0 ? 'no changes'
    : `${plural(diffStat.files, 'file')} · +${diffStat.added} −${diffStat.removed}`;
  const statX = dimEnd + 18;

  const baseName = clip(base, 12);
  const outcome = ff
    ? { text: `fast-forward · ${clip(base, 16)} didn't move`, color: INK.ok }
    : { text: `merge commit · ${clip(base, 16)} moved on`, color: INK.lamp };

  const H = removeCmd ? 182 : 158;
  const label = `${[
    `Merge ${feature} into ${base}`,
    ff ? `a fast-forward, ${base} didn't move` : `a merge commit, ${base} moved on`,
    plural(ahead, 'commit'),
    stat,
    behind > 0 && `${base} has ${behind} new since the branch point`,
  ].filter(Boolean).join(', ')}. Runs: ${cmds.join('; ')}.`;
  // Compact: from the lane start to the join, the lanes only.
  const right = Math.max(joinX, tipX, baseLastX) + 10;
  const compactBox = `${LANE_X - 2} ${BASE_Y - 10} ${right - LANE_X + 2} ${FEAT_Y - BASE_Y + 20}`;

  return (
    <Figure fig="merge" viewBox={`0 0 ${W} ${H}`} compactViewBox={compactBox} minWidth={520} compactMinWidth={160} fallback={fallback} label={label} paper="var(--ins-panel)">
      {!compact && (
        <>
          <Tag x={W} y={0} text={outcome.text} color={outcome.color} />
          {/* Branch names. */}
          <T x={0} y={BASE_Y + 4} color={INK.lamp}>{baseName}</T>
          <T x={0} y={FEAT_Y + 4} color={INK.fg}>{clip(feature, 12)}</T>
        </>
      )}

      {/* Base lane up to its last commit. */}
      <path
        d={`M${LANE_X} ${BASE_Y}H${baseLastX}`}
        style={{ fill: 'none', stroke: INK.muted, strokeWidth: STROKE.ink }}
      />
      {behindLabel && <T x={behindLabelX} y={BASE_Y + 17}>{behindLabel}</T>}

      {ff ? (
        <g>
          {/* The base pointer slides straight along to the feature tip. */}
          <path
            d={`M${FX + 6} ${BASE_Y}H${tipX - 6}`}
            style={{ fill: 'none', stroke: INK.ok, strokeWidth: STROKE.ink, strokeDasharray: DASH.medium }}
          />
          <path d={`M${tipX} ${BASE_Y}l-7 -3.5v7z`} style={{ fill: INK.ok }} />
          <path
            d={`M${tipX} ${BASE_Y + 6}V${FEAT_Y - 6}`}
            style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
          />
        </g>
      ) : (
        <g>
          {/* Base runs on to the merge commit; the feature tip curves into it. */}
          <path
            d={`M${baseLastX} ${BASE_Y}H${joinX}`}
            style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.ink, strokeDasharray: DASH.medium }}
          />
          <path
            d={`M${tipX} ${FEAT_Y}C${tipX + 24} ${FEAT_Y} ${joinX} ${FEAT_Y - 16} ${joinX} ${BASE_Y + 6}`}
            style={{ fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.ink, strokeDasharray: DASH.medium }}
          />
          <Node x={joinX} y={BASE_Y} state="merge" size={9} />
        </g>
      )}

      {/* Feature lane: off the fork, through each commit to the tip. */}
      <path
        d={`M${FX} ${BASE_Y}C${FX} ${FEAT_Y - 12} ${FX + 8} ${FEAT_Y} ${F0} ${FEAT_Y}H${tipX}`}
        style={{ fill: 'none', stroke: INK.fg, strokeWidth: STROKE.emphasis }}
      />
      {hidden > 0 && !compact && (
        <T x={(featXs[MAX_AHEAD - 2] + tipX) / 2} y={FEAT_Y - 7} anchor="middle">{more}</T>
      )}

      {/* Nodes over the lines. */}
      <Node x={FX} y={BASE_Y} state="done" size={7} />
      {behindXs.map((x) => <Node key={x} x={x} y={BASE_Y} state="done" size={7} />)}
      {featXs.map((x) => <Node key={x} x={x} y={FEAT_Y} state="done" size={7} />)}

      {/* How much is coming over. */}
      {!compact && featXs.length > 1 ? (
        <Dim x1={F0} x2={tipX} y={DIM_Y} label={dimFits ? dimLabel : ''} />
      ) : null}
      {!compact && !dimFits && <T x={tipX + 8} y={DIM_Y + 3.5}>{dimLabel}</T>}
      {stat && !compact && (
        <g>
          <Leader points={[[dimEnd + 4, DIM_Y], [statX, DIM_Y]]} dot={false} />
          <rect
            x={statX}
            y={DIM_Y - 9.5}
            width={textWidth(stat) + 14}
            height={19}
            style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
          />
          <T x={statX + 7} y={DIM_Y + 3.5} color={INK.fg}>{stat}</T>
        </g>
      )}

      {/* The commands, at the node each one acts on. */}
      {!compact && (
        <>
          {switchCmd && <Step x={baseLastX} y={ROW[0]} n={switchCmd.n} command={switchCmd.text} from={BASE_Y} />}
          <Step x={joinX} y={ROW[1]} n={mergeCmd.n} command={mergeCmd.text} from={BASE_Y} />
          {removeCmd && <Step x={tipX} y={ROW_BELOW} n={removeCmd.n} command={removeCmd.text} from={FEAT_Y} />}
        </>
      )}
    </Figure>
  );
}
