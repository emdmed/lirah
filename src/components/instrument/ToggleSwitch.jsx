import { cn } from '@/lib/utils';

const TONES = {
  ok: 'var(--ins-ok)',
  warn: 'var(--ins-warn)',
  fault: 'var(--ins-fault)',
  lamp: 'var(--ins-lamp)',
};

// A two-position switch. Real button with role="switch"; Space/Enter toggle.
export function ToggleSwitch({ checked, onChange, label, tone = 'ok', disabled = false, title, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn('ins-switch ins-well ins-round', className)}
      style={{ '--switch-c': TONES[tone] || TONES.ok }}
    >
      <span className="ins-switch-knob ins-round" />
    </button>
  );
}
