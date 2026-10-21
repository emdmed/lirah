import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Lamp } from "../instrument/Lamp";

// A readout line, not a key bank: an open/pressed segment reads in full
// foreground rather than sitting on the key's latched tint.
const SEGMENT = "h-4 px-1 gap-1 text-[10px] font-mono font-normal before:content-none after:content-none aria-pressed:bg-transparent aria-pressed:text-foreground";

/**
 * One segment of the prompt mode line. A button (a key that stays down while
 * `pressed`) when it has an action, a plain readout otherwise. `lit` lights
 * its lamp: the state it names is live in the next send.
 */
export function ModeSegment({ as, lit = false, lamp, pressed, label, onClick, className, children, ...rest }) {
  const lampEl = <Lamp state={lamp ?? (lit ? 'on' : 'off')} />;
  const tone = lit ? "text-foreground" : "text-muted-foreground";
  if (as === 'span' || !onClick) {
    return (
      <span
        {...rest}
        aria-label={label}
        className={cn("inline-flex items-center", SEGMENT, tone, "cursor-default", className)}
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
      className={cn(SEGMENT, tone, className)}
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
export function ModeSep() {
  return <span className="text-[10px] text-faint select-none" aria-hidden="true">·</span>;
}
