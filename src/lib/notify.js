// Desktop notification through the webview's Notification API. Best-effort:
// asks for permission once, and stays quiet when it is denied or unavailable.
export async function notify(title, body) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') new Notification(title, { body });
    }
  } catch {
    // Notifications are best-effort.
  }
}
