import { useLayoutEffect, useRef } from 'react';
import { Calibrated } from '@/components/instrument/calibrated';

/**
 * Draw a calibrated recipe into an inline <svg>, for the small row gauges
 * (no wrapper, no resize logic: CalRecipe is for figures). Returns the ref
 * to put on the <svg>. The first draw plays the recipe's motion; later
 * changes play `transition(prev, next)`'s data when it returns some (a
 * glide), else redraw still (Calibrated.update), so a ticking clock
 * neither replays the entry nor cuts a running one short.
 */
export function useCalSvg(recipe, data, transition) {
  const ref = useRef(null);
  const played = useRef(false);
  const prev = useRef(null);
  const key = JSON.stringify(data);

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const draw = Calibrated.recipes[recipe];
    const last = prev.current;
    prev.current = data;
    if (!played.current) {
      played.current = true;
      Calibrated.play(svg, draw, data);
      return;
    }
    const step = last && transition ? transition(last, data) : null;
    // Otherwise redraw still; a replay in flight lands on this data instead
    // of being cut short.
    if (step) Calibrated.play(svg, draw, step);
    else Calibrated.update(svg, draw, data);
    // `key` stands in for `data`.
  }, [recipe, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => () => ref.current?._calStop?.(), []);
  return ref;
}
