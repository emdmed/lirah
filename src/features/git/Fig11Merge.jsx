import { plural } from '../../lib/plural';
import { CalRecipe, Calibrated } from '@/components/instrument/calibrated';
import { FIGURES, figNumber } from '@/components/instrument/figure';

// FIG.11: what the merge will do to the history, as the calibrated merge
// recipe. The base lane with the commits made on it since the branch point,
// the feature branch above it with one node per commit, the merge to come
// lit by the lamp (dashed curve, node, verdict), the diff stat boxed on the
// branch, and each command beside the node it acts on: 1 switches base,
// 2 merges, 3 removes the feature worktree. The branch draws in when the
// dialog opens. Compact, or narrower than the recipe, shows `fallback`.

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

// Where the recipe sets each command, and the room it leaves before the edge.
const ROOM = [520 - 243 - 40, 412 - 30, 520 - 40];

// A command clipped to `room` px of legend text.
function clipTo(text, room) {
  const tw = (t) => Calibrated.textWidth(`$ ${t}`);
  if (tw(text) <= room) return text;
  let s = text;
  while (s.length > 1 && tw(`${s}…`) > room) s = s.slice(0, -1);
  return `${s}…`;
}

/** The merge plan drawn; `fallback` is what a narrow dialog shows. */
export function Fig11Merge({ feature, base, plan, fallback }) {
  const { ff, behind = 0, ahead = plan.commits.length, diffStat } = plan;
  const cmds = planCommands({ feature, base, plan });
  // The recipe's step slots: switch (under base), merge (at the join),
  // worktree remove (above the tip). An empty slot is left out.
  let i = 0;
  const slots = [
    plan.switchNeeded ? cmds[i++] : '',
    cmds[i++],
    plan.featureWorktree ? cmds[i++] : '',
  ].map((c, k) => (c ? clipTo(c, ROOM[k]) : ''));

  const stat = diffStat == null ? null
    : diffStat.files === 0 ? ['no changes', '']
    : [plural(diffStat.files, 'file'), `+${diffStat.added} −${diffStat.removed}`];

  const label = `${[
    `Merge ${feature} into ${base}`,
    ff ? `a fast-forward, ${base} didn't move` : `a merge commit, ${base} moved on`,
    plural(ahead, 'commit'),
    stat && stat.filter(Boolean).join(' '),
    behind > 0 && `${base} has ${behind} new since the branch point`,
  ].filter(Boolean).join(', ')}. Runs: ${cmds.join('; ')}.`;

  const data = {
    base,
    branch: feature,
    commits: Math.max(1, ahead),
    baseAhead: ff ? 0 : behind,
    files: stat ?? undefined,
    verdict: ff ? ['fast-forward', `${base} didn't move`] : ['merge commit', `${base} moved on`],
    steps: slots,
    label,
  };

  return (
    <div className="min-w-0" title={label}>
      <CalRecipe recipe="merge" title={FIGURES[figNumber('merge')].title} data={data} minWidth={440} fallback={fallback} />
    </div>
  );
}
