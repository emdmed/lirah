import { describe, expect, it } from 'vitest';
import { HALT_REASON, stopOutcome } from './planModel';
import { parseStatusMarker } from './planPrompts';

const base = { found: false, marker: null, running: true, nudged: false };

describe('auto-pilot on its agent\'s Stop', () => {
  it.each([
    ['the chunk committed', { found: true, marker: parseStatusMarker('PLAN-STATUS: blocked — ignored') }, 'advance', null],
    ['the agent says there was nothing to commit', { marker: parseStatusMarker('PLAN-STATUS: done — ran the tests') }, 'done', null],
    ['the agent is blocked', { marker: parseStatusMarker('PLAN-STATUS: blocked — no network') }, 'halt', HALT_REASON.BLOCKED],
    ['the agent has a question', { marker: parseStatusMarker('PLAN-STATUS: needs-input — which?'), nudged: true }, 'halt', HALT_REASON.NEEDS_INPUT],
    ['no commit, not nudged yet', {}, 'nudge', null],
    ['no commit after the nudge', { nudged: true }, 'halt', HALT_REASON.NO_COMMIT],
    ['no commit on a paused run', { running: false }, 'halt', HALT_REASON.NO_COMMIT],
  ])('%s', (_, over, action, reason) => {
    expect(stopOutcome({ ...base, ...over })).toEqual({ action, reason });
  });
});
