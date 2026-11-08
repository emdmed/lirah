import { describe, it, expect, vi } from 'vitest';

let finish;
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => new Promise((r) => { finish = r; })) }));
const { buildFeatureMap, featureMapStatus } = await import('./useFeatureMap');

describe('featureMapStatus', () => {
  const map = { features: [] };
  it('derives status', () => {
    expect(featureMapStatus({ map: null }, false, null)).toBe('none');
    expect(featureMapStatus({ map, commitsBehind: 0, newFiles: 0 }, false, null)).toBe('fresh');
    expect(featureMapStatus({ map, commitsBehind: null, newFiles: null }, false, null)).toBe('fresh');
    expect(featureMapStatus({ map: { ...map, gitSha: 'abc' }, commitsBehind: null, newFiles: null }, false, null)).toBe('stale');
    expect(featureMapStatus({ map, commitsBehind: 0, newFiles: 0, missingFiles: 2 }, false, null)).toBe('stale');
    expect(featureMapStatus({ map, commitsBehind: 2, newFiles: 0 }, false, null)).toBe('stale');
    expect(featureMapStatus({ map, commitsBehind: 0, newFiles: 1 }, false, null)).toBe('stale');
    expect(featureMapStatus({ map }, false, 'boom')).toBe('failed');
    expect(featureMapStatus({ map }, true, 'boom')).toBe('building');
  });
});

describe('buildFeatureMap', () => {
  it('runs one build per project', async () => {
    const run = buildFeatureMap('/p');
    expect(() => buildFeatureMap('/p')).toThrow(/already/);
    finish('ok');
    await expect(run).resolves.toBe('ok');
    buildFeatureMap('/p'); // free again
    finish('ok');
  });
});
