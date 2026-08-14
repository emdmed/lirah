import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';

/**
 * Live activity feed for a running extraction — the answer to "what is it doing
 * and why is it taking so long".
 *
 * Subscribes to the event log store directly rather than reading hook state, so
 * a fast event stream re-renders only this panel and not the composer above it.
 */

const KIND_STYLE = {
  stage: 'text-cyan-300 font-semibold',
  'stage-warn': 'text-red-400 font-semibold',
  init: 'text-sky-400',
  hook: 'text-violet-400',
  tool: 'text-amber-400',
  'tool-done': 'text-muted-foreground/60',
  'tool-error': 'text-red-400',
  say: 'text-foreground',
  'rate-limit': 'text-red-400',
  result: 'text-emerald-400',
  raw: 'text-muted-foreground',
};

function formatElapsed(ms) {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Ticks once a second, locally, so the elapsed clock does not re-render anything else. */
function useElapsed(startedAt, running) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);
  return startedAt ? now - startedAt : 0;
}

export function DesignActivity({ eventLog, startedAt, running, logPath, statusLabel }) {
  const { events, counters } = useSyncExternalStore(eventLog.subscribe, eventLog.getSnapshot);
  const elapsed = useElapsed(startedAt, running);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);

  // Follow the tail, but stop fighting the user if they scroll up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const copyLogPath = async () => {
    try {
      await navigator.clipboard.writeText(logPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the path is displayed anyway.
    }
  };

  const last = events[events.length - 1];
  const lastTool = [...events].reverse().find((e) => e.kind === 'tool');

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2 px-8 py-4 max-w-[110ch] mx-auto w-full">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-mono text-sm">{statusLabel}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatElapsed(elapsed)}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {counters.tools} tool calls
          {counters.turns ? ` · ${counters.turns} turns` : ''}
          {typeof counters.costUsd === 'number' ? ` · $${counters.costUsd.toFixed(2)}` : ''}
        </span>
      </div>

      {/* What it is doing right now, in one line. */}
      <div className="font-mono text-xs truncate">
        {lastTool && running ? (
          <>
            <span className="text-amber-400">{lastTool.label}</span>{' '}
            <span className="text-muted-foreground">{lastTool.detail}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{last ? last.label : 'Waiting for the first event…'}</span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-auto border border-sketch bg-background/50 p-2 font-mono text-[10px] leading-relaxed"
      >
        {events.length === 0 && (
          <div className="text-muted-foreground">
            No output yet. The extractor streams an event per message, tool call and hook —
            if nothing appears within ~30s, check the log below.
          </div>
        )}
        {events.map((event, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground/40 tabular-nums flex-shrink-0">
              {formatElapsed(event.at - startedAt)}
            </span>
            <span
              className={`flex-shrink-0 ${
                event.level === 'warn' ? 'text-red-400' : KIND_STYLE[event.kind] || 'text-foreground'
              }`}
            >
              {event.label}
            </span>
            {event.detail && (
              <span className="text-muted-foreground/70 truncate" title={event.detail}>
                {event.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      {logPath && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span className="truncate" title={logPath}>
            Raw log: {logPath}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={copyLogPath} title="Copy log path">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      )}
    </div>
  );
}
