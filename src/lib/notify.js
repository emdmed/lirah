import { getRecordingMode } from './recordingMode';

// Desktop notification through the webview's Notification API. Best-effort:
// asks for permission once, and stays quiet when it is denied or unavailable.
// `onClick` runs (after focusing the window) when the notification is clicked,
// where the platform reports clicks.
export async function notify(title, body, { onClick } = {}) {
  try {
    if (typeof Notification === 'undefined') return;
    // Notifications would pop over a promo recording.
    if ((await getRecordingMode()).quiet) return;
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
