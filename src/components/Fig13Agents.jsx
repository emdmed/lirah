import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Xmark } from 'iconoir-react';
import { FIGURES, figNumber, useFigureCompact } from '@/components/instrument/figure';
import { CalRecipe, Calibrated } from '@/components/instrument/calibrated';
import { agentName, formatElapsed, truncate } from './agentLabels';

// FIG 13: one tab's subagents as the calibrated fanout recipe. The main
// session is the parent (its node lit while any child runs); one branch per
// running subagent ends in a box (task, `tool · n msgs`, elapsed time in
// lamp). The newest finished one keeps a faint branch; older ones and those
// past MAX fold into one note that opens the card list. Branches grow out
// when the figure first shows and again when the set of branches changes;
// the clock redraws it still.
//
// The recipe is laid out at the pane's width (280–520) through CalRecipe's
// `fit`, so its text stays 1:1; task and meta are cut to the child box.
// Under STACK_W (the ~300px sidebar) it uses Lirah's fanoutStacked recipe
// instead: the parent on top and the children below it on a rail, so each
// child box spans the pane rather than the ~78px the kit's layout leaves.
// HTML hit areas (open card, hover ×, fold → list) sit over the boxes.
// Compact, or narrower than MIN_W, shows `fallback`.

const MAX = 6;
const MIN_W = 280;
const FIT = { min: MIN_W, max: 520 };
const STACK_W = 420; // narrower than this, the stacked layout
const TITLE_TOP = 0; // CalRecipe's caption sits under the drawing, so the stacked layout starts at the top
// The kit fanout's fixed geometry (calibrated-recipes.js, fanout).
const FAN = { kidX: 212, top: 44, gap: 52 };

const byStart = (a, b) => (a.started_at || '').localeCompare(b.started_at || '');
const byActivity = (a, b) => (b.last_activity || b.started_at || '').localeCompare(a.last_activity || a.started_at || '');

// Which agents get a branch and what folds. Pure, so it can be tested alone.
export function fanRows(agents, max = MAX) {
  const running = agents.filter((a) => a.status === 'running').sort(byStart);
  const finished = agents.filter((a) => a.status !== 'running').sort(byActivity);
  const candidates = finished.length ? [...running, finished[0]] : running;
  const shown = candidates.slice(0, max);
  const more = candidates.length - shown.length;
  const earlier = Math.max(0, finished.length - 1);
  return { shown, more, earlier, anyRunning: running.length > 0 };
}

// Cut text with an ellipsis to fit `width` drawing units in the legend font.
const fitWidth = (text, width) => {
  if (!text || Calibrated.textWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && Calibrated.textWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
};

export function Fig13Agents({ agents, now, onDismiss, onOpenList, renderCard, cli = 'claude', fallback = null }) {
  const compact = useFigureCompact();
  const rootRef = useRef(null);
  const [rootW, setRootW] = useState(null);
  const [open, setOpen] = useState(null); // agent_id of the expanded box

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setRootW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setRootW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { shown, more, earlier, anyRunning } = fanRows(agents);
  const openAgent = open && shown.find((a) => a.agent_id === open);
  // A dismissed or vanished agent closes its popover.
  useEffect(() => {
    if (open && !openAgent) setOpen(null);
  }, [open, openAgent]);
  // Click outside the expanded box closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const tooNarrow = rootW != null && rootW < MIN_W;
  if (agents.length === 0 || compact || tooNarrow) return <div ref={rootRef}>{fallback}</div>;

  // The width CalRecipe lays the recipe out at (its `fit`); 1:1 inside it.
  const w = Math.max(FIT.min, Math.min(FIT.max, Math.floor(rootW ?? FIT.max)));
  const s = 1;
  const stacked = w < STACK_W;
  const recipe = stacked ? 'fanoutStacked' : 'fanout';
  // Where the child boxes sit: from the stacked recipe's own layout, or the kit fanout's.
  const geo = stacked
    ? (() => {
      const L = Calibrated.recipes.fanoutStacked.layout({ w, top: TITLE_TOP, root: ['', ''], children: shown, folded: true });
      return { kidX: L.boxX, boxW: L.boxW, kidTop: (i) => L.kids[i].y, foldY: L.fy, foldX: L.boxX };
    })()
    : { kidX: FAN.kidX, boxW: w - FAN.kidX - 10, kidTop: (i) => FAN.top + i * FAN.gap - 6, foldY: FAN.top + shown.length * FAN.gap + 6, foldX: FAN.kidX };
  const KID_X = geo.kidX;
  const boxW = geo.boxW;
  const textW = boxW - 28;
  // The fold note in full, or as one count when the pane is narrow.
  const foldFull = [more > 0 && `+${more} more`, earlier > 0 && `+${earlier} done earlier`].filter(Boolean).join(' · ');
  const folded = foldFull && geo.foldX + Calibrated.textWidth(foldFull) > w - 4 ? `+${more + earlier} more` : foldFull;
  const oldest = [...agents].sort(byStart)[0];
  const mainValue = `main · ${formatElapsed(oldest?.started_at, now) ?? '—'}`;

  const children = shown.map((agent) => {
    const elapsed = formatElapsed(agent.started_at, now) ?? '';
    const meta = [agent.last_tool, agent.message_count > 0 ? `${agent.message_count} msgs` : null].filter(Boolean).join(' · ');
    return {
      task: fitWidth(agentName(agent), textW),
      meta: fitWidth(meta, textW - Calibrated.textWidth(elapsed) - 8),
      time: elapsed,
      live: agent.status === 'running',
    };
  });

  const running = agents.filter((a) => a.status === 'running');
  const label = `${cli} main session, ${mainValue.replace('main · ', '')}: ${running.length} of ${agents.length} subagent${agents.length === 1 ? '' : 's'} running${shown
    .map((a) => `; ${agentName(a)}, ${a.status === 'running' ? 'running' : 'done'} ${formatElapsed(a.started_at, now) ?? ''}`.trimEnd())
    .join('')}${folded ? `; ${folded}` : ''}.`;

  const dismiss = (id) => {
    if (open === id) setOpen(null);
    onDismiss(id);
    rootRef.current?.focus();
  };

  // Hit areas, in drawing units, scaled to CSS px.
  const px = (v) => v * s;
  const { kidTop, foldY } = geo;

  return (
    <div ref={rootRef} tabIndex={-1} className="outline-none" title={label}>
      <div className="relative">
        <CalRecipe
          recipe={recipe}
          title={FIGURES[figNumber('agents')].title}
          data={{ root: [cli, mainValue], children, folded: folded || undefined, label, ...(stacked && { top: TITLE_TOP }) }}
          fit={FIT}
          replayKey={shown.map((a) => a.agent_id).join(',')}
          paper="var(--color-sidebar, var(--ins-panel))"
          fallback={fallback}
        />

        {folded && (
          <button
            type="button"
            onClick={onOpenList}
            className="absolute cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--ins-edge-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
            style={{ left: px(geo.foldX - 4), top: px(foldY - 10), width: px(Calibrated.textWidth(folded) + 8), height: px(18) }}
            aria-label={`${folded}: show all subagents as a list`}
            title="Show all as a list"
          />
        )}

        {shown.map((agent, i) => {
          const id = agent.agent_id;
          const name = agentName(agent);
          const isOpen = open === id;
          const isRunning = agent.status === 'running';
          return (
            <div key={id} className="group absolute" style={{ left: px(KID_X), top: px(kidTop(i)), width: px(boxW), height: px(32) }}>
              <button
                type="button"
                className="absolute inset-0 cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--ins-edge-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
                aria-expanded={isOpen}
                aria-label={`${name}, ${isRunning ? 'running' : 'done'}, ${formatElapsed(agent.started_at, now) ?? ''}. Delete dismisses.`}
                title={truncate(name, 120)}
                onClick={() => setOpen(isOpen ? null : id)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && isOpen) {
                    e.stopPropagation();
                    setOpen(null);
                  } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    dismiss(id);
                  }
                }}
              />
              <button
                type="button"
                className="absolute right-0.5 top-0.5 p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
                onClick={() => dismiss(id)}
                aria-label={`Dismiss ${name}`}
                title="Dismiss"
              >
                <Xmark width={10} height={10} className="text-muted-foreground" />
              </button>
            </div>
          );
        })}

        {openAgent && (
          <div
            className="absolute z-20 shadow-lg"
            style={{ left: px(KID_X), top: px(kidTop(shown.indexOf(openAgent)) + 32) + 2, width: Math.max(px(boxW), 200) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(null);
            }}
          >
            {renderCard(openAgent)}
          </div>
        )}
      </div>
    </div>
  );
}
