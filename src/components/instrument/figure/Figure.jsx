import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSetting } from '@/features/settings/settingsStore';
import { FigLabel } from './kit';
import { FIGURES, figNumber } from './registry';

function parseViewBox(viewBox) {
  const [x = 0, y = 0, width = 0, height = 0] = String(viewBox).trim().split(/[\s,]+/).map(Number);
  return { x, y, width, height };
}

// A drawn figure, or its compact fallback. `fig` is a FIG number or key from
// registry.js; the title defaults to the registry's. The drawing scales down
// with its container but never above 1:1, and when the container is narrower
// than `minWidth` (default: the viewBox width, so 11px text stays 11px) the
// fallback renders instead. `fallback` is also what figures: compact shows.
// `paper` sets --fig-paper so boxes and dots match the host surface.
export function Figure({
  fig,
  title,
  viewBox,
  fallback = null,
  label,
  minWidth,
  paper = 'var(--ins-panel)',
  className,
  children,
}) {
  const [mode] = useSetting('figures');
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(null);
  const compact = mode === 'compact';

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (compact || !el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);

  if (compact) return fallback;

  const vb = parseViewBox(viewBox);
  const floor = minWidth ?? vb.width;
  const tooNarrow = width != null && width < floor;

  const n = typeof fig === 'number' ? fig : figNumber(fig);
  const heading = title ?? (n != null ? FIGURES[n]?.title : undefined);

  return (
    <div ref={wrapRef} className={className} style={{ width: '100%', minWidth: 0 }}>
      {tooNarrow ? fallback : (
        <svg
          role="img"
          aria-label={label}
          viewBox={viewBox}
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
          {n != null && <FigLabel n={n} title={heading} x={vb.x} y={vb.y + 11} />}
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
