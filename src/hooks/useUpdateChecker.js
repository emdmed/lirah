import { useState, useEffect } from 'react';
import { version as CURRENT_VERSION } from '../../package.json';

const GITHUB_REPO = 'emdmed/lirah';
const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

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

  useEffect(() => {
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

    check();
    const interval = setInterval(check, CHECK_INTERVAL);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return update;
}
