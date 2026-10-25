import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Lamp } from "../instrument/Lamp";

// A readout line, not a key bank: an open/pressed segment reads in full
// foreground rather than sitting on the key's latched tint.
const SEGMENT = "gap-1 font-mono font-normal before:content-none after:content-none aria-pressed:bg-transparent aria-pressed:text-foreground";
// sm: the prompt box's mode line. md: the context pane's controls, on the
// app's 24px / 11px control scale.
const SEGMENT_SIZE = { sm: "h-4 px-1 text-[10px]", md: "h-6 px-1.5 text-[11px]" };

/**
 * One segment of the prompt mode line. A button (a key that stays down while
 * `pressed`) when it has an action, a plain readout otherwise. `lit` lights
 * its lamp: the state it names is live in the next send.
 */
export function ModeSegment({ as, size = "sm", lit = false, lamp, pressed, label, onClick, className, children, ...rest }) {
  // Only a lit lamp is drawn: on a line of text, a row of dark lenses is
  // noise, and the dimmed label already says "off".
  const lampState = lamp ?? (lit ? 'on' : 'off');
  const lampEl = lampState === 'off' ? null : <Lamp state={lampState} />;
  const tone = lit ? "text-foreground" : "text-muted-foreground";
  if (as === 'span' || !onClick) {
    return (
      <span
        {...rest}
        aria-label={label}
        className={cn("inline-flex items-center", SEGMENT, SEGMENT_SIZE[size], tone, "cursor-default", className)}
      >
        {lampEl}
        {children}
      </span>
    );
  }
  return (
    <Button
      {...rest}
      variant="ghost"
      size="xs"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(SEGMENT, SEGMENT_SIZE[size], tone, className)}
    >
      {lampEl}
      {children}
    </Button>
  );
}

// The × that clears a segment's state from the prompt.
export function ModeClear({ onClick, label }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-4 w-4 p-0 text-[10px] font-mono text-muted-foreground hover:text-foreground before:content-none after:content-none"
    >
      ×
    </Button>
  );
}

// The `·` between segments.
export function ModeSep({ size = "sm" }) {
  return <span className={cn(size === "md" ? "text-[11px]" : "text-[10px]", "text-faint select-none")} aria-hidden="true">·</span>;
}

const INPUT_MODES = [
  { value: 'terminal', text: 'terminal', title: 'Type prompts in the terminal; this pane shows the context that goes with them' },
  { value: 'box', text: 'prompt box', title: "Type prompts in Lirah's prompt box" },
];

/**
 * Where prompts are typed: in the terminal (the context pane shows what goes
 * with them) or in Lirah's prompt box. A framed pair of keys in the pane's
 * legend, the same in both views; the current one is held down (tint + lamp
 * ink). A radiogroup: arrows switch.
 */
export function InputModeSwitch({ mode, onChange }) {
  const pick = (value) => { if (value !== mode) onChange(value); };
  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    pick(mode === 'terminal' ? 'box' : 'terminal');
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground" aria-hidden="true">type prompts in</span>
      <span
        role="radiogroup"
        aria-label="Where you type prompts"
        onKeyDown={onKeyDown}
        className="-my-[3px] inline-flex edge-engraved"
      >
        {INPUT_MODES.map(({ value, text, title }) => {
          const on = value === mode;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              data-lit={on || undefined}
              tabIndex={on ? 0 : -1}
              title={title}
              onClick={() => pick(value)}
              className="ins-key h-5 px-2 font-mono text-[11px] leading-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1"
            >
              {text}
            </button>
          );
        })}
      </span>
    </span>
  );
}
