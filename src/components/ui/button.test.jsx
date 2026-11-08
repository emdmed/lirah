import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './button';

const html = (props) => renderToStaticMarkup(<Button {...props}>Go</Button>);

describe('Button', () => {
  it.each([
    ['default', 'ins-key-primary'],
    ['outline', 'ins-key-outline'],
    ['ghost', 'ins-key-ghost'],
    ['destructive', 'ins-key-danger'],
    ['destructive-fill', 'ins-key-danger-fill'],
    ['link', 'ins-link'],
  ])('%s renders %s', (variant, cls) => {
    expect(html({ variant })).toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
  });

  it('busy disables, sets aria-busy and shows the scanner', () => {
    const out = html({ busy: true });
    expect(out).toContain('disabled=""');
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('ins-scan');
  });

  it('icon-panel is a square panel key', () => {
    const out = html({ size: 'icon-panel' });
    expect(out).toContain('data-icon-only=""');
    expect(out).toContain('ins-key-panel');
  });
});
