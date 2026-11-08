import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Fig36FeatureFiles } from './Fig36FeatureFiles';

// Figure reads the figures setting through a client-only store; draw children bare.
vi.mock('@/components/instrument/figure', async (orig) => ({
  ...(await orig()),
  Figure: ({ children, label }) => <svg aria-label={label}>{children}</svg>,
  useFigureCompact: () => false,
}));

const f = (id, n) => ({ id, name: id, files: Array.from({ length: n }, (_, i) => `${id}/${i}`) });

describe('Fig36FeatureFiles', () => {
  it('draws every pinned file as sent, with nothing hatched', () => {
    const html = renderToStaticMarkup(<Fig36FeatureFiles features={[f('a', 18), f('b', 14), f('c', 22), f('d', 7)]} />);
    expect(html).toContain('send 61 files');
    expect(html).not.toContain('<pattern');
  });
});
