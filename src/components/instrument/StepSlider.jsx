import { useRef } from 'react';
import { cn } from '@/lib/utils';

// A slider that snaps to fixed steps (scrollback depth). Ticks per step with
// short labels under them, a well rail with a legend fill, the star as thumb,
// and a tube readout that turns warn from `warnFrom` (a step index) on.
//
// steps: [{ value, label, short }]  label is the readout, short sits under the tick
export function StepSlider({ value, steps, onChange, label, warnFrom, className }) {
  const trackRef = useRef(null);
  const last = steps.length - 1;
  const index = Math.max(0, steps.findIndex((s) => s.value === value));
  const warn = warnFrom != null && index >= warnFrom;

  const setIndex = (i) => {
    const next = Math.max(0, Math.min(last, Math.round(i)));
    if (next !== index) onChange?.(steps[next].value);
  };

  const fromPointer = (clientX) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setIndex(((clientX - r.left) / r.width) * last);
  };

  const onKeyDown = (e) => {
    const to = {
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      PageUp: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      PageDown: index - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    setIndex(to);
  };

  const pct = (i) => (last === 0 ? 0 : (i / last) * 100);

  return (
    <div className={cn('ins-step', className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={steps[index]?.label}
        className="ins-step-track"
        style={{ '--pv': last === 0 ? 0 : index / last }}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
        }}
      >
        {steps.map((s, i) => (
          <span
            key={`t${s.value}`}
            className="ins-step-tick"
            data-warn={warnFrom != null && i >= warnFrom ? '' : undefined}
            style={{ left: `calc(${pct(i)}% - ${i === last ? 1 : 0}px)` }}
          />
        ))}
        <span className="ins-step-rail" />
        <span className="ins-step-fill" />
        <span className="ins-step-thumb" />
        {steps.map((s, i) => (
          <span
            key={`l${s.value}`}
            className="ins-step-label"
            data-first={i === 0 ? '' : undefined}
            data-last={i === last ? '' : undefined}
            style={{ left: `${pct(i)}%` }}
            aria-hidden="true"
          >
            {s.short ?? s.label}
          </span>
        ))}
      </div>
      <span className="tube ins-step-read" data-level={warn ? 'warn' : undefined} aria-hidden="true">
        {steps[index]?.label}
      </span>
    </div>
  );
}
