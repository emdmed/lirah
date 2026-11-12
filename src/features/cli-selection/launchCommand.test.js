import { describe, it, expect } from 'vitest';
import { buildLaunchCommand } from './launchCommand';

const WIN = 'C:\\Users\\Dell\\.lirah\\claude-plugin';
const POSIX = '/home/u/.lirah/claude-plugin';

describe('buildLaunchCommand', () => {
  it('powershell: Clear-Host, plugin dir quoted, CR at the end', () => {
    expect(buildLaunchCommand({ command: 'claude', base: WIN, powershell: true }))
      .toBe("Clear-Host; claude --plugin-dir 'C:\\Users\\Dell\\.lirah\\claude-plugin'\r");
  });

  it('posix: clear &&, plugin dir quoted, CR at the end', () => {
    expect(buildLaunchCommand({ command: 'claude', base: POSIX, powershell: false }))
      .toBe("clear && claude --plugin-dir '/home/u/.lirah/claude-plugin'\r");
  });

  it('no base: only the command', () => {
    expect(buildLaunchCommand({ command: 'claude', base: null, powershell: false })).toBe('clear && claude\r');
    expect(buildLaunchCommand({ command: 'claude', powershell: true })).toBe('Clear-Host; claude\r');
  });

  it('keeps the command verbatim (custom or npx fallback)', () => {
    expect(buildLaunchCommand({ command: 'npx @anthropic-ai/claude-code', powershell: false }))
      .toBe('clear && npx @anthropic-ai/claude-code\r');
  });

  it('adds --resume after the plugin dir', () => {
    expect(buildLaunchCommand({ command: 'claude', base: POSIX, resumeId: 'abc-123', powershell: false }))
      .toBe("clear && claude --plugin-dir '/home/u/.lirah/claude-plugin' --resume 'abc-123'\r");
  });

  it('adds --append-system-prompt after --resume', () => {
    expect(buildLaunchCommand({ command: 'claude', base: POSIX, resumeId: 'r1', systemPrompt: 'be brief', powershell: false }))
      .toBe("clear && claude --plugin-dir '/home/u/.lirah/claude-plugin' --resume 'r1' --append-system-prompt 'be brief'\r");
  });

  it("powershell doubles ' in the system prompt", () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: "it's ok", powershell: true }))
      .toBe("Clear-Host; claude --append-system-prompt 'it''s ok'\r");
  });

  it("posix escapes ' as '\\'' in the system prompt", () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: "it's ok", powershell: false }))
      .toBe("clear && claude --append-system-prompt 'it'\\''s ok'\r");
  });

  it('powershell doubles every curly quote kind', () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: 'a‘b’c‚d‛e', powershell: true }))
      .toBe("Clear-Host; claude --append-system-prompt 'a‘‘b’’c‚‚d‛‛e'\r");
  });

  it('posix leaves curly quotes alone', () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: 'a‘b’c', powershell: false }))
      .toBe("clear && claude --append-system-prompt 'a‘b’c'\r");
  });

  it('quotes the base dir with an apostrophe too', () => {
    expect(buildLaunchCommand({ command: 'claude', base: "C:\\Users\\O'Neil\\p", powershell: true }))
      .toBe("Clear-Host; claude --plugin-dir 'C:\\Users\\O''Neil\\p'\r");
  });

  it('user plugins add --plugin-dir and --add-dir each, in order, after the other flags', () => {
    const plugins = [
      { dir: '/home/u/.lirah/plugins/a', folder: '/work/a' },
      { dir: '/home/u/.lirah/plugins/b', folder: "/work/b'c" }
    ];
    expect(buildLaunchCommand({ command: 'claude', base: POSIX, systemPrompt: 'sp', plugins, powershell: false }))
      .toBe(
        "clear && claude --plugin-dir '/home/u/.lirah/claude-plugin' --append-system-prompt 'sp'" +
        " --plugin-dir '/home/u/.lirah/plugins/a' --add-dir '/work/a'" +
        " --plugin-dir '/home/u/.lirah/plugins/b' --add-dir '/work/b'\\''c'\r"
      );
  });

  it('user plugins in powershell', () => {
    const plugins = [{ dir: 'C:\\p\\a', folder: "C:\\w\\it's" }];
    expect(buildLaunchCommand({ command: 'claude', plugins, powershell: true }))
      .toBe("Clear-Host; claude --plugin-dir 'C:\\p\\a' --add-dir 'C:\\w\\it''s'\r");
  });

  it('empty plugins list adds nothing', () => {
    expect(buildLaunchCommand({ command: 'claude', plugins: [], powershell: false })).toBe('clear && claude\r');
  });
});
