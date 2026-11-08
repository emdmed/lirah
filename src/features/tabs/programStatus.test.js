import { describe, expect, it } from 'vitest';

import { parseProgramStatus } from './programStatus';
import { feedOutput, outputSince, watchOutput } from './outputTail';

describe('parseProgramStatus', () => {
  it('maps the protocol words onto tab states', () => {
    expect(parseProgramStatus('state=working:progress=40')).toEqual({ state: 'working', message: undefined });
    expect(parseProgramStatus('state=blocked:kind=permission')).toEqual({ state: 'permission', message: 'permission' });
    expect(parseProgramStatus('state=idle')).toEqual({ state: 'waiting', message: undefined });
    expect(parseProgramStatus('state=error')).toMatchObject({ state: 'done', error: true });
    expect(parseProgramStatus('state=clear')).toBeNull();
  });

  it('decodes the base64 message', () => {
    expect(parseProgramStatus(`state=done:msg=${btoa('all green')}`)).toEqual({ state: 'done', message: 'all green' });
  });

  it('ignores sub-records and junk', () => {
    expect(parseProgramStatus('state=working:id=sub1')).toBeUndefined();
    expect(parseProgramStatus('state=dancing')).toBeUndefined();
    expect(parseProgramStatus('')).toBeUndefined();
  });
});

describe('outputTail', () => {
  const bytes = (s) => new TextEncoder().encode(s);

  it('keeps only output after the watch starts, without escapes', () => {
    feedOutput('s1', bytes('before'));
    const from = watchOutput('s1', 10_000);
    feedOutput('s1', bytes('\x1b[32mserver \x1b]0;title\x07ready\x1b[0m'));
    expect(outputSince('s1', from)).toBe('server ready');
  });

  it('finds text split across chunks from an earlier offset', () => {
    const from = watchOutput('s2', 10_000);
    feedOutput('s2', bytes('rea'));
    feedOutput('s2', bytes('dy'));
    expect(outputSince('s2', from)).toContain('ready');
    expect(outputSince('s2', from + 3)).toBe('dy');
  });
});
