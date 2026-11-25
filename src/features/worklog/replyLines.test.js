import { describe, it, expect } from 'vitest';
import { parseFlags, parseAssumptions } from './replyLines';

const reply = `Added the export button to the week view.

⚠ F1: the CSV drops notes longer than 10k chars, since the store truncates them. Suggest raising the cap.
**⚠ F2:** \`npm test\` fails on dayLayout.test.js, unrelated to this change.
- ⚠ the build warns about chunk size
⚠ F1: the CSV drops notes longer than 10k chars, since the store truncates them. Suggest raising the cap.

Assumed: exports use the local time zone.
**Assumed:** \`changes.csv\` is a fine default name
- \`Assumed: one file per week\`

R1: add a JSON export.
Decision: keep CSV only.`;

describe('parseFlags', () => {
  it('reads numbered and unnumbered ⚠ lines, deduplicated, with edge markdown stripped', () => {
    expect(parseFlags(reply)).toEqual([
      { n: 'F1', text: 'the CSV drops notes longer than 10k chars, since the store truncates them. Suggest raising the cap.' },
      { n: 'F2', text: '`npm test` fails on dayLayout.test.js, unrelated to this change.' },
      { n: null, text: 'the build warns about chunk size' },
    ]);
  });

  it('reads the emoji form and returns none for a reply without flags', () => {
    expect(parseFlags('⚠️ f3: x')).toEqual([{ n: 'F3', text: 'x' }]);
    expect(parseFlags('All done.')).toEqual([]);
    expect(parseFlags(undefined)).toEqual([]);
  });
});

describe('parseAssumptions', () => {
  it('reads Assumed: lines in order, keeping inner backticks', () => {
    expect(parseAssumptions(reply)).toEqual(['exports use the local time zone.', '`changes.csv` is a fine default name', 'one file per week']);
    expect(parseAssumptions('Nothing assumed here.')).toEqual([]);
  });
});
