import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { INK, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { cn } from '../../lib/utils';
import { AUTOPILOT_STATUS, CHUNK_STATUS } from './planModel';

// Small presentational pieces of the plans pane.

export function EmptyLine({ children, hint }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2 text-[11px]">
      <div className="text-foreground">
        <span className="text-muted-foreground">-- </span>
        {children}
        <span className="text-muted-foreground"> --</span>
      </div>
      {hint && <div className="leading-relaxed text-muted-foreground"># {hint}</div>}
    </div>
  );
}

// Agent-written prose: `code` spans read brighter, and long text folds to a
// few lines behind a [more] toggle so one chunk can't fill the pane.
const CLAMP = { 3: 'line-clamp-3', 4: 'line-clamp-4' };

export function Prose({ text, clamp, className }) {
  const [full, setFull] = useState(false);
  const long = clamp && (text.length > clamp * 70 || text.split('\n').length > clamp);
  const parts = text.split(/`([^`\n]+)`/);
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      {/* wrap-anywhere (not break-words) lets long paths and identifiers shrink
          the min-content width, so they wrap instead of widening the pane. */}
      <p
        className={cn('whitespace-pre-wrap wrap-anywhere', long && !full && CLAMP[clamp])}
      >
        {parts.map((part, i) =>
          i % 2 ? <code key={i} className="text-foreground">{part}</code> : part
        )}
      </p>
      {long && (
        <button
          onClick={() => setFull((v) => !v)}
          className="tui-btn self-start text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
          aria-expanded={full}
        >
          {full ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="engraved-label">{label}</span>
      {children}
    </div>
  );
}

// P4: chunk progress as the FIG.16 node line. Filled for done, outlined for
// to-do (struck through when skipped or rolled back), a fault square for the
// chunk that needs you, and the lamp star only while a chunk runs. Full boxes
// the done/total count after the line; compact is the nodes alone, with the
// count in the tooltip. Too narrow for the nodes, it falls back to text.
// `paper` matches the host surface for the outlined nodes and the box.

const NODE = 6;
const MIN_SP = 5;
const MAX_SP = 12;
const PAD = 7; // room for the live star's points at either end
const H = 18;
const BOX_GAP = 8;

/** Each chunk's node, pure: done, todo, live or fault (needs you). */
export function chunkNodes(plan) {
  const ap = plan.autopilot;
  const halted = ap?.status === AUTOPILOT_STATUS.PAUSED || ap?.status === AUTOPILOT_STATUS.FAILED;
  return plan.chunks.map((c) => {
    const needsYou = !!c.needsCommit || (halted && c.id === ap.chunkId && c.status !== CHUNK_STATUS.IMPLEMENTED);
    const live = !needsYou && (c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix);
    return {
      n: c.n,
      state: needsYou ? 'fault' : live ? 'live' : c.status === CHUNK_STATUS.IMPLEMENTED ? 'done' : 'todo',
      struck: c.status === CHUNK_STATUS.SKIPPED || c.status === CHUNK_STATUS.ROLLED_BACK,
    };
  });
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function ProgressReadout({ plan, done, total, paper }) {
  const compact = useFigureCompact();
  const [ref, avail] = useWidth();
  const nodes = useMemo(() => chunkNodes(plan), [plan]);
  const count = nodes.length;

  const live = nodes.find((nd) => nd.state === 'live');
  const fault = nodes.find((nd) => nd.state === 'fault');
  const label = `${done} of ${total} chunks implemented${
    fault ? ` · chunk ${fault.n} needs you` : live ? ` · chunk ${live.n} running` : ''}`;

  const tally = `${done}/${total}`;
  const boxW = compact ? 0 : textWidth(tally) + 12;
  const boxPart = compact ? 0 : BOX_GAP + boxW;
  const room = avail == null ? Infinity : avail - 2 * PAD - boxPart;
  const spacing = count > 1 ? Math.min(MAX_SP, room / (count - 1)) : 0;
  const tooNarrow = count > 1 && spacing < MIN_SP;

  const xAt = (i) => PAD + i * spacing;
  const lineEnd = xAt(count - 1);
  const width = Math.ceil(lineEnd + PAD + boxPart);
  const y = H / 2;
  const size = Math.min(NODE, Math.max(3, spacing - 3)) || NODE;
  let inkTo = nodes.findIndex((nd) => nd.state === 'live' || nd.state === 'fault');
  if (inkTo < 0) nodes.forEach((nd, i) => { if (nd.state === 'done') inkTo = i; });

  return (
    <div ref={ref} className="min-w-0" title={label}>
      {tooNarrow ? (
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground" role="img" aria-label={label}>
          <span className={done > 0 ? 'text-foreground' : undefined}>{done}</span>/{total}{' '}chunks
        </span>
      ) : (
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          style={{ display: 'block', overflow: 'visible', '--fig-paper': paper }}
        >
          {count > 1 && (
            <line x1={PAD} x2={lineEnd} y1={y} y2={y} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
          )}
          {inkTo > 0 && (
            <line x1={PAD} x2={xAt(inkTo)} y1={y} y2={y} style={{ stroke: INK.fg, strokeWidth: STROKE.hair }} />
          )}
          {nodes.map((nd, i) => {
            const x = xAt(i);
            const h = size / 2 + 1;
            return (
              <g key={nd.n}>
                {nd.state === 'fault' ? (
                  <rect x={x - size / 2} y={y - size / 2} width={size} height={size} style={{ fill: INK.fault }} />
                ) : (
                  <Node x={x} y={y} state={nd.state} size={nd.state === 'live' ? Math.max(5, size) : size} />
                )}
                {nd.struck && (
                  <line
                    x1={x - h}
                    y1={y + h}
                    x2={x + h}
                    y2={y - h}
                    style={{ stroke: INK.muted, strokeWidth: STROKE.hair }}
                  />
                )}
              </g>
            );
          })}
          {!compact && (
            <g>
              <rect
                x={width - boxW + 0.5}
                y={0.5}
                width={boxW - 1}
                height={H - 1}
                style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
              />
              <T x={width - boxW / 2} y={y + 4} anchor="middle">
                <tspan style={{ fill: done > 0 ? INK.fg : INK.muted }}>{done}</tspan>/{total}
              </T>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

// The lamp for each auto-pilot status, in the pane and the status bar.
export const AUTOPILOT_LAMP = {
  [AUTOPILOT_STATUS.RUNNING]: { state: 'on', blink: true },
  [AUTOPILOT_STATUS.PAUSED]: { state: 'warn' },
  [AUTOPILOT_STATUS.FAILED]: { state: 'fault' },
  [AUTOPILOT_STATUS.DONE]: { state: 'ok' },
  [AUTOPILOT_STATUS.OFF]: { state: 'off' },
};
