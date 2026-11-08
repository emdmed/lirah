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
const count = (html, s) => html.split(s).length - 1;

describe('Fig36FeatureFiles', () => {
  it('hatches files past the 40 cap and a 4th feature, with a CAP 40 tick', () => {
    const html = renderToStaticMarkup(<Fig36FeatureFiles features={[f('a', 18), f('b', 14), f('c', 22), f('d', 7)]} />);
    expect(html).toContain('send 40 of 61 files');
    expect(count(html, '<pattern')).toBe(21);
    expect(html).toContain('CAP 40');
  });
  it('draws no tick under the cap', () => {
    const html = renderToStaticMarkup(<Fig36FeatureFiles features={[f('a', 5), f('b', 4)]} />);
    expect(count(html, '<pattern')).toBe(0);
    expect(html).not.toContain('CAP 40');
  });
});
