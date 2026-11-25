import { useRef } from 'react';

// True once `on` turns true while mounted, and until it turns false again.
// Already true at mount means it was there before you looked: no arrival.
// Marks the arrival so its entrance plays only then, not on every reopen.
export function useArrived(on) {
  const seen = useRef(on);
  const arrived = useRef(false);
  if (on && !seen.current) arrived.current = true;
  if (!on) arrived.current = false;
  seen.current = on;
  return arrived.current;
}
