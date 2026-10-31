import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Figure, INK, STROKE, DASH, CH, T, Node, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { agentName, formatElapsed, truncate } from './agentLabels';

// FIG 13: one tab's subagents as a fan. The main session sits top-left; one
// elbow branch per running subagent ends in a two-line box (task, then
// `tool · n msgs` with the elapsed time at right). The newest finished one
// keeps a faint branch; older ones fold into `+k done earlier`. Past MAX
// branches the rest fold into `+k more`, which opens the card list.
//
// The drawing is laid out at the container's width, so it is always 1:1 and
// the HTML hit areas (focus ring, expand, hover ×) sit at the same pixels as
// the boxes they cover.
//
// Compact: the fan as thin rows, no boxes or text. Each branch runs on as a
// line as long as the agent has been at it (on the oldest one's scale) and
// ends in its node; folds are short dashed stubs. The rows stay clickable,
// with the agent's name as their tooltip.

const MAX = 6;
const MIN_W = 200; // below this the card list is easier to read
const C_MIN_W = 120; // compact has no text to keep at 1:1
const MAX_W = 480;
const PAD = 4; // matches the list's px-1
const SPINE = 12;
const BOX_X = 28;
const TOP = 20;
const ROW = 38; // two-line box (32) + gap
const FOLD = 25; // one-line fold box (19) + gap
const C_ROW = 12;
const C_H = 10;
const C_TOP = 2;
const C_FOLD_W = 16;

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

function fitText(text, width) {
  const n = Math.max(4, Math.floor(width / CH));
  if (!text || text.length <= n) return text;
  return `${text.slice(0, n - 1)}…`;
}

function layout(agents, width, compact = false) {
  const { shown, more, earlier, anyRunning } = fanRows(agents);
  const boxW = width - BOX_X - 1;
  const rows = [];
  const agentH = compact ? C_H : 32;
  const foldH = compact ? C_H : 19;
  let y = compact ? C_TOP + C_H + 2 : TOP + 32 + 10;
  for (const agent of shown) {
    rows.push({ kind: 'agent', agent, y, h: agentH });
    y += compact ? C_ROW : ROW;
  }
  if (more > 0) {
    rows.push({ kind: 'fold', text: `+${more} more`, y, h: foldH });
    y += compact ? C_ROW : FOLD;
  }
  if (earlier > 0) {
    rows.push({ kind: 'fold', text: `+${earlier} done earlier`, y, h: foldH });
    y += compact ? C_ROW : FOLD;
  }
  const oldest = [...agents].sort(byStart)[0];
  return { rows, boxW, height: y - (compact ? 1 : 4), anyRunning, oldest };
}

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

// Compact marks: origin, spine, and per row a branch running on as a line.
function CompactFan({ rows, boxW, anyRunning, oldest, now }) {
  const lastMid = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h / 2 : C_TOP + C_H;
  const t0 = ms(oldest?.started_at);
  const scale = Math.max(1, now - (Number.isNaN(t0) ? now : t0));
  const lenOf = (agent) => {
    const start = ms(agent.started_at);
    if (Number.isNaN(start)) return 6;
    const end = agent.status === 'running' ? now : ms(agent.last_activity) || now;
    return Math.max(6, Math.min(1, (end - start) / scale) * (boxW - 8));
  };
  return (
    <g>
      <rect x={SPINE - 4} y={C_TOP + C_H / 2 - 4} width={8} height={8} style={{ fill: INK.fg }} />
      {anyRunning && <Node x={SPINE + 12} y={C_TOP + C_H / 2} state="live" size={4} />}
      {rows.length > 0 && (
        <path d={`M${SPINE} ${C_TOP + C_H / 2 + 4}V${lastMid}`} style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair }} />
      )}
      {rows.map((r) => {
        const mid = r.y + r.h / 2;
        if (r.kind === 'fold') {
          return (
            <path
              key={r.text}
              d={`M${SPINE} ${mid}H${BOX_X + C_FOLD_W}`}
              style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
            />
          );
        }
        const { agent } = r;
        const running = agent.status === 'running';
        const end = BOX_X + lenOf(agent);
        return (
          <g key={agent.agent_id}>
            <path
              d={`M${SPINE} ${mid}H${end}`}
              style={{ fill: 'none', stroke: running ? INK.lamp : INK.faint, strokeWidth: running ? STROKE.ink : STROKE.hair }}
            />
            <Node x={end} y={mid} state={running ? 'live' : 'done'} size={running ? 4 : 5} />
          </g>
        );
      })}
    </g>
  );
}

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

  const width = Math.min(MAX_W, Math.floor((rootW ?? 256) - PAD * 2));
  // Memoised on the agents and width, not the clock: the tick only redraws text.
  const fig = useMemo(() => layout(agents, width, compact), [agents, width, compact]);

  // A dismissed or vanished agent closes its popover.
  const openAgent = open && fig.rows.find((r) => r.kind === 'agent' && r.agent.agent_id === open);
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

  if (agents.length === 0 || (rootW != null && width < (compact ? C_MIN_W : MIN_W))) return <div ref={rootRef}>{fallback}</div>;

  const { rows, boxW, height, anyRunning, oldest } = fig;
  const mainValue = `main · ${formatElapsed(oldest?.started_at, now) ?? '—'}`;
  const originW = Math.max(textWidth(cli), textWidth(mainValue)) + 16 + (anyRunning ? 16 : 0);
  const lastMid = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h / 2 : TOP + 32;

  const dismiss = (id) => {
    if (open === id) setOpen(null);
    onDismiss(id);
    rootRef.current?.focus();
  };

  const running = agents.filter((a) => a.status === 'running');
  const label = `${cli} main session, ${mainValue.replace('main · ', '')}: ${running.length} of ${agents.length} subagent${agents.length === 1 ? '' : 's'} running${rows
    .filter((r) => r.kind === 'agent')
    .map((r) => `; ${agentName(r.agent)}, ${r.agent.status === 'running' ? 'running' : 'done'} ${formatElapsed(r.agent.started_at, now) ?? ''}`.trimEnd())
    .join('')}${rows.filter((r) => r.kind === 'fold').map((r) => `; ${r.text}`).join('')}.`;

  return (
    <div ref={rootRef} tabIndex={-1} className="outline-none">
      <div className="relative px-1">
        <Figure
          fig="agents"
          viewBox={`0 0 ${width} ${height}`}
          minWidth={MIN_W}
          compactMinWidth={C_MIN_W}
          paper="var(--color-sidebar, var(--ins-panel))"
          label={label}
          fallback={fallback}
        >
          {compact ? <CompactFan rows={rows} boxW={boxW} anyRunning={anyRunning} oldest={oldest} now={now} /> : (
          <>
          {/* origin: the main session */}
          <rect x={0.5} y={TOP} width={originW} height={32} style={{ fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.ink }} />
          <T x={7} y={TOP + 13} color={INK.fg}>{cli}</T>
          <T x={7} y={TOP + 26}>{mainValue}</T>
          {anyRunning && <Node x={originW - 8} y={TOP + 16} state="live" size={5} />}

          {/* spine */}
          {rows.length > 0 && (
            <path
              d={`M${SPINE} ${TOP + 32}V${lastMid}`}
              style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair }}
            />
          )}

          {rows.map((r) => {
            const mid = r.y + r.h / 2;
            if (r.kind === 'fold') {
              return (
                <g key={r.text}>
                  <path
                    d={`M${SPINE} ${mid}H${BOX_X}`}
                    style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
                  />
                  <rect
                    x={BOX_X}
                    y={r.y}
                    width={textWidth(r.text) + 16}
                    height={19}
                    style={{ fill: INK.paper, stroke: INK.edge, strokeWidth: STROKE.hair, strokeDasharray: DASH.medium }}
                  />
                  <T x={BOX_X + 7} y={r.y + 13}>{r.text}</T>
                </g>
              );
            }
            const { agent } = r;
            const running = agent.status === 'running';
            const elapsed = formatElapsed(agent.started_at, now) ?? '';
            const meta = [agent.last_tool, agent.message_count > 0 ? `${agent.message_count} msgs` : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <g key={agent.agent_id}>
                <path
                  d={`M${SPINE} ${r.y - 6}V${mid}H${BOX_X}`}
                  style={{
                    fill: 'none',
                    stroke: running ? INK.lamp : INK.faint,
                    strokeWidth: running ? STROKE.ink : STROKE.hair,
                  }}
                />
                <rect
                  x={BOX_X}
                  y={r.y}
                  width={boxW}
                  height={32}
                  style={{ fill: INK.paper, stroke: running ? INK.edgeStrong : INK.edge, strokeWidth: STROKE.hair }}
                />
                {!running && <Node x={BOX_X} y={mid} state="done" size={6} />}
                <T x={BOX_X + 7} y={r.y + 13} color={running ? INK.fg : INK.muted}>
                  {fitText(agentName(agent), boxW - 14 - 14)}
                </T>
                <T x={BOX_X + 7} y={r.y + 26}>
                  {fitText(meta, boxW - 14 - textWidth(elapsed) - 8)}
                </T>
                <T x={BOX_X + boxW - 7} y={r.y + 26} anchor="end" color={running ? INK.lamp : INK.muted}>
                  {elapsed}
                </T>
              </g>
            );
          })}
          </>
          )}
        </Figure>

        {/* HTML hit areas over the boxes, offset by the px-1 padding */}
        {rows.map((r) => {
          const style = { left: PAD + BOX_X, top: r.y, height: r.h };
          if (r.kind === 'fold') {
            return (
              <button
                key={r.text}
                type="button"
                onClick={onOpenList}
                className="absolute cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--ins-edge-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
                style={{ ...style, width: compact ? C_FOLD_W : textWidth(r.text) + 16 }}
                aria-label={`${r.text}: show all subagents as a list`}
                title={compact ? `${r.text}: show all as a list` : 'Show all as a list'}
              />
            );
          }
          const { agent } = r;
          const id = agent.agent_id;
          const name = agentName(agent);
          const isOpen = open === id;
          const running = agent.status === 'running';
          return (
            <div key={id} className="group absolute" style={{ ...style, width: boxW }}>
              <button
                type="button"
                className="absolute inset-0 cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--ins-edge-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
                aria-expanded={isOpen}
                aria-label={`${name}, ${running ? 'running' : 'done'}, ${formatElapsed(agent.started_at, now) ?? ''}. Delete dismisses.`}
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
              {!compact && <button
                type="button"
                className="absolute right-0.5 top-0.5 p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)]"
                onClick={() => dismiss(id)}
                aria-label={`Dismiss ${name}`}
                title="Dismiss"
              >
                <X size={10} className="text-muted-foreground" />
              </button>}
            </div>
          );
        })}

        {openAgent && (
          <div
            className="absolute z-20 shadow-lg"
            style={{ left: PAD + BOX_X, top: openAgent.y + openAgent.h + 2, width: boxW }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(null);
            }}
          >
            {renderCard(openAgent.agent)}
          </div>
        )}
      </div>
    </div>
  );
}
