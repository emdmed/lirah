import { forwardRef } from 'react';

/**
 * A small mouse control inside a tab row. Hidden from screen readers and out
 * of the tab order: the row's aria-label already says what it shows and the
 * row keys (rowKeys.js) do what it does, so a reader hears each row once.
 * Clicks don't reach the row.
 */
export const RowAction = forwardRef(function RowAction({ onClick, children, ...props }, ref) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      {...props}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {children}
    </span>
  );
});
