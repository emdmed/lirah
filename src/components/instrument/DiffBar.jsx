// A 40px bar split green/red in proportion to added/removed lines. Bar length
// is log-scaled once the total passes 200, so one huge diff doesn't flatten
// every other job's bar to nothing.
export function DiffBar({ added = 0, removed = 0, width = 40 }) {
  const total = added + removed;
  if (total === 0) return null;
  const fill = total <= 200 ? total / 200 : Math.min(1, 0.6 + 0.4 * (Math.log10(total / 200) / 2));
  const len = Math.max(4, Math.round(width * Math.min(fill, 1)));
  const addLen = Math.round(len * (added / total));
  return (
    <span
      className="inline-flex h-[3px] shrink-0 bg-[var(--ins-well)]"
      style={{ width }}
      role="img"
      aria-label={`${added} added, ${removed} removed`}
    >
      <span style={{ width: addLen, background: 'var(--ins-ok)' }} />
      <span style={{ width: len - addLen, background: 'var(--ins-fault)' }} />
    </span>
  );
}
