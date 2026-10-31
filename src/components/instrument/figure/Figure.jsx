import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSetting } from '@/features/settings/settingsStore';
import { FigLabel } from './kit';
import { FIGURES, figNumber } from './registry';

function parseViewBox(viewBox) {
  const [x = 0, y = 0, width = 0, height = 0] = String(viewBox).trim().split(/[\s,]+/).map(Number);
  return { x, y, width, height };
}

// True when figures: compact is set. Compact figures keep their marks
// (nodes, spans, ticks) and drop scale numbers, boxes, leaders and the FIG
// label; the values move to the tooltip (the figure's `label`).
export function useFigureCompact() {
  const [mode] = useSetting('figures');
  return mode === 'compact';
}

// A drawn figure. `fig` is a FIG number or key from registry.js; the title
// defaults to the registry's. The drawing scales down with its container but
// never above 1:1, and when the container is narrower than `minWidth`
// (default: the viewBox width, so 11px text stays 11px) the fallback renders
// instead. `paper` sets --fig-paper so boxes and dots match the host surface.
//
// Compact mode draws too, from `compactViewBox` (marks only, no FIG label,
// `label` as the hover tooltip). A figure without a `compactViewBox` has not
// been given a compact form yet and shows `fallback` in compact mode.
export function Figure({
  fig,
  title,
  viewBox,
  compactViewBox,
  compactMinWidth,
  fallback = null,
  label,
  minWidth,
  paper = 'var(--ins-panel)',
  className,
  children,
}) {
  const compact = useFigureCompact();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(null);
  const textOnly = compact && !compactViewBox;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (textOnly || !el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [textOnly]);

  if (textOnly) return fallback;

  const box = compact ? compactViewBox : viewBox;
  const vb = parseViewBox(box);
  const floor = (compact ? compactMinWidth : minWidth) ?? vb.width;
  const tooNarrow = width != null && width < floor;

  const n = typeof fig === 'number' ? fig : figNumber(fig);
  const heading = title ?? (n != null ? FIGURES[n]?.title : undefined);

  return (
    <div
      ref={wrapRef}
      className={className}
      title={compact ? label : undefined}
      style={{ width: '100%', minWidth: 0 }}
    >
      {tooNarrow ? fallback : (
        <svg
          role="img"
          aria-label={label}
          viewBox={box}
          preserveAspectRatio="xMinYMin meet"
          style={{
            display: 'block',
            width: '100%',
            maxWidth: vb.width || undefined,
            height: 'auto',
            overflow: 'visible',
            '--fig-paper': paper,
          }}
        >
          {n != null && !compact && <FigLabel n={n} title={heading} x={vb.x} y={vb.y + 11} />}
          {children}
        </svg>
      )}
    </div>
  );
}

// A linear scale from [0, domainMax] onto [x0, x1], clamped to the ends.
// An empty or negative domain maps everything to x0.
export function useFigureScale(domainMax, x0, x1) {
  return useCallback(
    (v) => {
      if (!(domainMax > 0)) return x0;
      const t = Math.min(1, Math.max(0, (Number(v) || 0) / domainMax));
      return x0 + t * (x1 - x0);
    },
    [domainMax, x0, x1],
  );
}
