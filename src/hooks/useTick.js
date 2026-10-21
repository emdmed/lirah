import { useEffect, useState } from 'react';

/** The current time, re-rendering every second while `on`, for a running clock. */
export function useTick(on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    let timer;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [on]);
  return now;
}
