import { useState, useEffect } from 'react';
import { usePageVisible } from './usePageVisible';
import { version as CURRENT_VERSION } from '../../package.json';

const GITHUB_REPO = 'emdmed/lirah';
const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
let lastCheckAt = 0;

function isNewer(remote, local) {
  const r = remote.replace(/^v/, '').split('.').map(Number);
  const l = local.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export function useUpdateChecker() {
  const [update, setUpdate] = useState(null);
  const pageVisible = usePageVisible();

  useEffect(() => {
    if (!pageVisible) return;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          { headers: { Accept: 'application/vnd.github.v3+json' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const tag = data.tag_name;
        if (tag && isNewer(tag, CURRENT_VERSION) && !cancelled) {
          setUpdate({ version: tag, url: data.html_url });
        }
      } catch {
        // silently ignore network errors
      }
    };

    // Becoming visible re-checks, but no more than once per interval.
    const sinceLast = Date.now() - lastCheckAt;
    let interval = null;
    const start = setTimeout(() => {
      lastCheckAt = Date.now();
      check();
      interval = setInterval(() => { lastCheckAt = Date.now(); check(); }, CHECK_INTERVAL);
    }, Math.max(0, CHECK_INTERVAL - sinceLast));
    return () => { cancelled = true; clearTimeout(start); clearInterval(interval); };
  }, [pageVisible]);

  return update;
}
