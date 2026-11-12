import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLaunchCommand } from './launchCommand';

// Windows PowerShell 5.1 splits a native argument at an embedded ", pwsh 7
// does not (and there \" would arrive literally), so the line escapes " at
// run time by shell version. Exact expectation, prompt without ' or curly quotes:
const ESCAPED =
  "Clear-Host; claude --append-system-prompt ('say \"hi\" now'.Replace('\"', " +
  "$(if ($PSNativeCommandArgumentPassing -in 'Standard','Windows') { '\"' } else { '\\\"' })))\r";

describe('buildLaunchCommand powershell, prompt with double quotes', () => {
  it('escapes " at run time by PowerShell version', () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: 'say "hi" now', powershell: true })).toBe(ESCAPED);
  });

  it('keeps doubling apostrophes inside the expression', () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: 'it\'s "x"', powershell: true }))
      .toContain("('it''s \"x\"'.Replace(");
  });

  it('posix is unchanged by double quotes (single-quoted already)', () => {
    expect(buildLaunchCommand({ command: 'claude', systemPrompt: 'say "hi"', powershell: false }))
      .toBe("clear && claude --append-system-prompt 'say \"hi\"'\r");
  });
});

const PROMPTS = {
  plain: 'be brief',
  masterLike: 'Follow the lirah skill\'s "Orchestrating from the workspace terminal" section. Use `lirah tabs` [x].',
  quotes: 'a "b c" d "e" \'f\' `g` ‘h’ “i” [j] $k',
  trailingBackslash: 'path C:\u005cx\u005c and "q" end\u005c'
};

const shells = ['powershell.exe', 'pwsh.exe'].filter(
  (s) => process.platform === 'win32' && spawnSync(s, ['-NoProfile', '-Command', '1']).status === 0
);

describe.skipIf(process.platform !== 'win32')('end to end in the real shell', () => {
  for (const shell of shells) {
    for (const [name, prompt] of Object.entries(PROMPTS)) {
      it(`${shell}: ${name} arrives as one argument`, () => {
        const dir = mkdtempSync(join(tmpdir(), 'lirah-argv-'));
        try {
          const script = join(dir, 'argv.js');
          writeFileSync(script, 'console.log("ARGV:" + JSON.stringify(process.argv.slice(2)));');
          const line = buildLaunchCommand({
            command: `node '${script}'`,
            systemPrompt: prompt,
            powershell: true
          }).trimEnd();
          const encoded = Buffer.from(line, 'utf16le').toString('base64');
          const r = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' });
          const out = r.stdout.split(/\r?\n/).find((l) => l.startsWith('ARGV:'));
          expect(out, r.stdout + r.stderr).toBeDefined();
          expect(JSON.parse(out.slice(5))).toEqual(['--append-system-prompt', prompt]);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    }
  }
});
