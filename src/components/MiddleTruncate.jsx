import { cn } from '../lib/utils';

// Names that share long prefixes (agentic-orchestration-…) differ at the end,
// so the ellipsis goes in the middle and the tail always shows.
const TAIL = 8;

export function MiddleTruncate({ text, className }) {
  if (text.length <= TAIL * 2) {
    return <span className={cn('min-w-0 truncate', className)}>{text}</span>;
  }
  return (
    <span className={cn('flex min-w-0', className)}>
      <span className="truncate">{text.slice(0, -TAIL)}</span>
      <span className="shrink-0">{text.slice(-TAIL)}</span>
    </span>
  );
}
