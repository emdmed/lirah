import { invoke } from '@tauri-apps/api/core';

// How this run was launched for a promo recording (LIRAH_THEME, LIRAH_PROFILE).
// Asked once; a normal launch resolves to no theme and not quiet.
let pending = null;

/** @returns {Promise<{ theme: string | null, quiet: boolean }>} */
export function getRecordingMode() {
  pending ??= invoke('get_recording_mode').catch(() => ({ theme: null, quiet: false }));
  return pending;
}
