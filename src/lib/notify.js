import { getRecordingMode } from './recordingMode';

// The last notifications, for an outside notifier (the Omarchy plugin) that
// reads them through `lirah status` and shows them itself.
const MAX_ALERTS = 20;
// While a notifier has polled this recently, it shows the alerts and the
// webview stays quiet, so nothing appears twice.
const NOTIFIER_TTL_MS = 15 * 1000;
const alerts = [];
let alertSeq = 0;
let notifierSeenAt = 0;

export function markNotifier() {
  notifierSeenAt = Date.now();
}

export function recentAlerts() {
  return alerts;
}

// Desktop notification through the webview's Notification API. Best-effort:
// asks for permission once, and stays quiet when it is denied or unavailable.
// `onClick` runs (after focusing the window) when the notification is clicked,
// where the platform reports clicks. `tabId` is the tab an outside notifier
// focuses when its notification is clicked.
export async function notify(title, body, { onClick, tabId = null } = {}) {
  try {
    // Notifications would pop over a promo recording.
    if ((await getRecordingMode()).quiet) return;
    alerts.push({ seq: ++alertSeq, at: Date.now(), title, body: body || '', tabId });
    if (alerts.length > MAX_ALERTS) alerts.shift();
    if (Date.now() - notifierSeenAt < NOTIFIER_TTL_MS) return;
    if (typeof Notification === 'undefined') return;
    let perm = Notification.permission;
    if (perm !== 'granted' && perm !== 'denied') perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const n = new Notification(title, { body });
    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
      };
    }
  } catch {
    // Notifications are best-effort.
  }
}
