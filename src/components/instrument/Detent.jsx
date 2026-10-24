import { useRef } from 'react';
import { cn } from '@/lib/utils';

// An ordered choice of 3-5 steps (detail level, a size): labels over ticks on
// a well rail, with the meter's star as the needle. A radiogroup with roving
// focus: arrows step, Home/End jump. Handled keys don't bubble, so it can sit
// inside a list that has its own key bindings.
//
// options: [{ value, label, title? }]
export function Detent({ value, options, onChange, label, className }) {
  const refs = useRef([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const moveTo = (to) => {
    const next = Math.max(0, Math.min(options.length - 1, to));
    if (next !== index) onChange?.(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e) => {
    const to = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    moveTo(to);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('ins-detent', className)}
      style={{ '--n': options.length, '--i': index }}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          title={o.title}
          onClick={() => moveTo(i)}
          className="ins-detent-stop"
        >
          {o.label}
        </button>
      ))}
      <span className="ins-detent-needle" aria-hidden="true" />
    </div>
  );
}
