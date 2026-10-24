import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Checkbox: a native checkbox (visually hidden, so it keeps keyboard and
 * screen-reader behaviour) drawn as an instrument well.
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
      {/* A square well; checked draws Eärendil's star in ink (.ins-check). */}
      <span
        onClick={handleVisualClick}
        role="presentation"
        data-checked={checked || undefined}
        data-disabled={disabled || undefined}
        className={cn("ins-check", className)}
      />
    </div>
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
