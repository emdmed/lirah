import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/**
 * Simple checkbox component
 * Uses native HTML checkbox with custom styling
 */
const Checkbox = React.forwardRef(({
  className,
  checked,
  onCheckedChange,
  disabled,
  ...props
}, ref) => {
  const inputRef = React.useRef(null);

  const handleChange = (e) => {
    onCheckedChange?.(e.target.checked);
  };

  const handleVisualClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <input
        type="checkbox"
        ref={(node) => {
          inputRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className="peer sr-only"
        {...props}
      />
      <div
        onClick={handleVisualClick}
        role="presentation"
        className={cn(
          "h-4 w-4 shrink-0 flex items-center justify-center border border-[var(--tui-line-strong)] bg-background",
          "peer-focus-visible:outline-1 peer-focus-visible:outline-solid peer-focus-visible:outline-primary",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          "peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary",
          "",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className
        )}
      >
        {checked && (
          <Check className="h-3 w-3 text-current" strokeWidth={4} />
        )}
      </div>
    </div>
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
