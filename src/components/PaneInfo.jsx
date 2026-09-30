import { cn } from '@/lib/utils';

// Status text set into a pane's bottom border, lazygit style: `└── 12 of 34 ─┘`.
// Must be rendered inside a `.tui-pane`.
export function PaneInfo({ children, className }) {
  if (children == null || children === false) return null;
  return <span className={cn('tui-pane-info', className)}>{children}</span>;
}
