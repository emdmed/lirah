import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFigureCompact } from '../figure/Figure';
import { Calibrated } from './kit';

// A calibrated recipe (Calibrated.recipes[name]) drawn into an <svg>.
// The first draw replays the recipe's motion once it is half in view
// (Calibrated.play). Later data changes redraw it still
// (Calibrated.update), so a ticking clock doesn't sweep the figure in again
// and a replay in flight lands on the newest data, unless:
//   - `transition(prev, next)` returns data to play (e.g. a loop step), or
//   - `replayKey` changed (e.g. a chunk landed): the entry motion replays. `title` is printed
// top-left in the app's figure label style (no FIG number). The drawing
// scales with its pane, never above 1:1; narrower than `minWidth` (default:
// 90% of the recipe's width) it shows `fallback` instead. With `fit` ({ min,
// max }) the recipe is drawn at the pane's width (data.w) within those
// bounds, and `min` is the floor. Recipes have no compact form, so compact
// figures show `fallback` too.
const TITLE_H = 18; // a recipe given no n/title leaves this much room on top

export function CalRecipe({ recipe, data: given, transition, replayKey, title, minWidth, fit, fallback = null, paper = 'var(--ins-panel)', className }) {
  const compact = useFigureCompact();
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const played = useRef(false);
  const prev = useRef({ data: null, replayKey });
  const [width, setWidth] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The recipe with the app's title printed into its free top margin.
  const draw = useMemo(() => {
    const base = Calibrated.recipes[recipe];
    const head = title ? Calibrated.K.t(0, 11, String(title).toUpperCase(), 'mu', 'start', 0.5) : '';
    const fn = (d) => {
      const r = base(d);
      return head ? { ...r, h: Math.max(r.h, TITLE_H), markup: head + r.markup } : r;
    };
    fn.extent = base.extent;
    fn.duration = base.duration;
    return fn;
  }, [recipe, title]);

  const fitW = fit ? Math.max(fit.min, Math.min(fit.max, Math.floor(width ?? fit.max))) : null;
  const data = useMemo(() => (fitW ? { ...given, w: fitW } : given), [given, fitW]);
  const result = useMemo(() => draw(data), [draw, data]);
  const key = useMemo(() => JSON.stringify(data), [data]);
  // The kit keeps legends at 10px or more by not shrinking below 90%; a
  // figure may set a lower `minWidth` on purpose. Below the floor: fallback.
  const floor = minWidth ?? fit?.min ?? Math.round(result.w * 0.9);
  const tooNarrow = compact || (width != null && width < floor);

  const unmeasured = !!fit && width == null;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    // A fitted recipe waits for its pane's width, or the first replay would
    // run at fit.max and be cut off by the redraw at the real width.
    if (!svg || tooNarrow || unmeasured) return;
    const last = prev.current;
    prev.current = { data, replayKey };
    const step = played.current && last.data ? transition?.(last.data, data) : null;
    if (!played.current || replayKey !== last.replayKey) {
      played.current = true;
      Calibrated.play(svg, draw, data);
    } else if (step) {
      Calibrated.play(svg, draw, step);
    } else {
      // A replay in flight (or still waiting to be seen) carries on and lands
      // on this data, so a ticking clock never cuts it short.
      Calibrated.update(svg, draw, data);
    }
    // `key` stands in for `data`: a re-render with equal data draws nothing.
  }, [draw, key, tooNarrow, unmeasured]);

  useLayoutEffect(() => () => svgRef.current?._calStop?.(), []);

  return (
    <div ref={wrapRef} className={`cal ${className ?? ''}`} style={{ width: '100%', minWidth: 0, '--fig-paper': paper }}>
      {tooNarrow ? fallback : (
        <svg ref={svgRef} className="cal-recipe" style={{ maxWidth: result.w }} />
      )}
    </div>
  );
}
