import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

// A one-of-n choice for filters and ranges: ghost keys in one framed bank.
// The chosen key takes the ink tint (not lamp gold: a filter is a setting,
// not live state). Settings rows use `Choice`.
//
// options: [{ value, label }]
export function SegmentBank({ value, options, onChange, label, className }) {
  const refs = useRef([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e) => {
    const to = {
      ArrowRight: (index + 1) % options.length,
      ArrowDown: (index + 1) % options.length,
      ArrowLeft: (index - 1 + options.length) % options.length,
      ArrowUp: (index - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onChange?.(options[to].value);
    refs.current[to]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn('ins-seg', className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onChange?.(o.value)}
          className={buttonVariants({ variant: 'ghost', size: 'panel' })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
