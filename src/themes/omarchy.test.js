import { describe, expect, it } from 'vitest';
import { buildOmarchyTheme, hexToHsl } from './omarchy';

describe('omarchy theme', () => {
  it('converts hex to an hsl triplet', () => {
    expect(hexToHsl('#ff0000')).toBe('0 100% 50%');
    expect(hexToHsl('#000000')).toBe('0 0% 0%');
  });

  it('builds a theme from colors.toml', () => {
    const t = buildOmarchyTheme('# x\nmode = "light"\naccent = "#1e66f5"\nbackground = "#eff1f5"\nforeground = "#4c4f69"\nred = "#d20f39"\nmuted = "#acb0be"\n');
    expect(t.type).toBe('light');
    expect(t.terminal.background).toBe('#eff1f5');
    expect(t.terminal.brightBlack).toBe('#acb0be');
    expect(t.terminal.brightRed).toBe('#d20f39');
    expect(t.ui.primary).toBe('#1e66f5');
  });

  it('is null without a palette', () => {
    expect(buildOmarchyTheme('')).toBeNull();
  });
});
