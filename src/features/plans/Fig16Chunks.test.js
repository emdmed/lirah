import { describe, expect, it, vi } from 'vitest';

// The custom elements need a browser; the ruler maths doesn't.
vi.mock('@/components/instrument/calibrated', () => ({}));
import { chunkRuler } from './Fig16Chunks';

const chunk = (id, status) => ({ id, status });

describe('chunkRuler', () => {
  it('marks the chunk a failed run stopped on as a fault', () => {
    const plan = {
      autopilot: { status: 'failed', chunkId: 'c3' },
      chunks: [chunk('c1', 'implemented'), chunk('c2', 'implemented'), chunk('c3', 'in-progress'), chunk('c4', 'pending')],
    };
    expect(chunkRuler(plan).states).toEqual(['done', 'done', 'fault', 'todo']);
  });

  it('keeps the live star while a run is going', () => {
    const plan = {
      autopilot: { status: 'running', chunkId: 'c2' },
      chunks: [chunk('c1', 'implemented'), chunk('c2', 'in-progress'), chunk('c3', 'pending')],
    };
    expect(chunkRuler(plan).states).toEqual(['done', 'live', 'todo']);
  });
});
