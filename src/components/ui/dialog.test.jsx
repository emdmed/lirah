import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogRow, DialogField } from './dialog';

describe('DialogRow', () => {
  it('renders name and preview', () => {
    const out = renderToStaticMarkup(<DialogRow name="Review" preview="Check the diff" />);
    expect(out).toContain('Review');
    expect(out).toContain('Check the diff');
    expect(out).not.toContain('ins-row-selected');
  });

  it('selected sets ins-row-selected', () => {
    expect(renderToStaticMarkup(<DialogRow name="a" selected />)).toContain('ins-row-selected');
  });

  it('clicking an action does not reach onClick', () => {
    // No DOM in the test env: call the action area's handler as React would.
    const row = DialogRow({ name: 'a', onClick: vi.fn(), actions: <button>x</button> });
    const actionArea = row.props.children[1];
    const e = { stopPropagation: vi.fn() };
    actionArea.props.onClick(e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(row.props.onClick).not.toHaveBeenCalled();
  });
});

describe('DialogField', () => {
  it('wires the label to the control and renders the error', () => {
    const out = renderToStaticMarkup(
      <DialogField label="Title" htmlFor="t" error="Title cannot be empty">
        <input id="t" />
      </DialogField>
    );
    expect(out).toContain('<label for="t" class="ins-legend text-[11px]">Title</label>');
    expect(out).toContain('id="t"');
    expect(out).toContain('<p class="text-xs text-destructive">Title cannot be empty</p>');
  });

  it('renders no error line without an error', () => {
    expect(renderToStaticMarkup(<DialogField label="T" htmlFor="t"><input /></DialogField>)).not.toContain('text-destructive');
  });
});
