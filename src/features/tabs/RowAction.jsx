import { forwardRef } from 'react';

/**
 * A small control inside a clickable row: a span, since the row is itself a
 * role="button" holding other controls. Clicks don't reach the row, and it is
 * focusable, with Enter and Space doing what a click does.
 *
 * Without `onClick` (e.g. as a dropdown trigger with asChild) it leaves the
 * keyboard to whoever handles it and only keeps clicks from the row.
 */
export const RowAction = forwardRef(function RowAction({ onClick, onKeyDown, children, ...props }, ref) {
  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      {...props}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!onClick || e.defaultPrevented) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick(e);
        }
      }}
    >
      {children}
    </span>
  );
});
