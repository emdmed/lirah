import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { themes } from './theme-config';

// The "omarchy" theme follows the desktop's active Omarchy theme
// (~/.local/state/omarchy/current/theme/colors.toml). It only exists on Omarchy.

export const OMARCHY_THEME = 'omarchy';

// shortcut: reads only flat `key = "value"` lines, which is all colors.toml holds; use a TOML parser if it grows tables.
export function parseColors(text) {
  const colors = {};
  for (const m of text.matchAll(/^\s*([a-z0-9_]+)\s*=\s*"([^"]*)"/gim)) colors[m[1]] = m[2];
  return colors;
}

/** "#rrggbb" → "h s% l%", the bare triplet the semantic tokens use. */
export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return `${Math.round(((h * 60) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** A Lirah theme from colors.toml, mapped the way Omarchy's own terminal templates map it. */
export function buildOmarchyTheme(text) {
  const c = parseColors(text);
  if (!c.background || !c.foreground) return null;
  const bg = c.background;
  const fg = c.foreground;
  const accent = c.accent ?? c.blue ?? fg;
  const raised = c.lighter_background ?? c.selection ?? bg;
  const border = c.selection ?? raised;
  return {
    name: 'Omarchy',
    type: c.mode === 'light' ? 'light' : 'dark',
    terminal: {
      foreground: fg,
      background: bg,
      cursor: c.cursor ?? c.bright_foreground ?? fg,
      cursorAccent: bg,
      selectionBackground: c.selection_background ?? c.selection ?? raised,
      selectionForeground: c.selection_foreground ?? fg,
      black: c.color0 ?? bg,
      red: c.red,
      green: c.green,
      yellow: c.yellow,
      blue: c.blue,
      magenta: c.magenta,
      cyan: c.cyan,
      white: c.color7 ?? fg,
      brightBlack: c.color8 ?? c.muted,
      brightRed: c.bright_red ?? c.red,
      brightGreen: c.bright_green ?? c.green,
      brightYellow: c.bright_yellow ?? c.yellow,
      brightBlue: c.bright_blue ?? c.blue,
      brightMagenta: c.bright_magenta ?? c.magenta,
      brightCyan: c.bright_cyan ?? c.cyan,
      brightWhite: c.bright_foreground ?? fg,
    },
    ui: {
      background: bg,
      foreground: fg,
      card: raised,
      cardForeground: fg,
      popover: raised,
      popoverForeground: fg,
      primary: accent,
      primaryForeground: bg,
      secondary: raised,
      secondaryForeground: fg,
      muted: raised,
      mutedForeground: c.dark_foreground ?? c.muted ?? fg,
      accent,
      accentForeground: bg,
      destructive: c.red ?? fg,
      destructiveForeground: fg,
      border,
      input: raised,
      inputBackground: c.darker_background ?? bg,
      ring: accent,
      sidebar: bg,
      sidebarForeground: fg,
      sidebarPrimary: accent,
      sidebarPrimaryForeground: bg,
      sidebarAccent: raised,
      sidebarAccentForeground: fg,
      sidebarBorder: border,
      sidebarRing: accent,
      folder: hexToHsl(c.yellow ?? accent),
      gitAdded: hexToHsl(c.green ?? accent),
      gitDeleted: hexToHsl(c.red ?? fg),
      treeGuide: `${hexToHsl(fg)} / 0.1`,
    },
  };
}

const listeners = new Set();

/** Calls `cb` after the Omarchy palette changed; returns the unsubscribe. */
export function onOmarchyChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function refresh() {
  const theme = buildOmarchyTheme((await invoke('omarchy_colors')) ?? '');
  // A failed read keeps the last palette, so a selected theme never vanishes mid-run.
  if (theme) themes[OMARCHY_THEME] = theme;
}

/** Adds the "omarchy" theme when running on Omarchy and keeps it in step. Awaited before first render. */
export async function initOmarchyTheme() {
  try {
    await refresh();
    if (!themes[OMARCHY_THEME]) return;
    listen('omarchy-theme-changed', async () => {
      await refresh();
      listeners.forEach((cb) => cb());
    }).catch(() => {});
    invoke('start_omarchy_watcher').catch((e) => console.warn('Failed to watch Omarchy theme:', e));
  } catch {
    // Not running inside Tauri (plain vite or tests).
  }
}
