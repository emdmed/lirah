// QA driver: lets a QA agent see and use the UI through `lirah qa ...`.
// Only reachable when the app runs with LIRAH_QA=1 (the Rust control server
// refuses `qa` otherwise). Reads the DOM as text, so it works without painting.

const INTERACTIVE = 'button, a[href], input, textarea, select, summary, [role=button], [role=tab], [role=menuitem], '
  + '[role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=checkbox], [role=switch], [role=radio], '
  + '[role=treeitem], [role=link], [role=combobox], [contenteditable=true], [tabindex]:not([tabindex="-1"])';
const LANDMARK = 'h1, h2, h3, [role=dialog], [role=alertdialog], [role=alert], [role=status], [role=tooltip], [role=menu]';

let refs = new Map();

const clip = (s, n = 80) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function visible(el) {
  // Background tab panes stay mounted but are aria-hidden: the user can't see or use them.
  if (!el.getClientRects().length || el.closest('[aria-hidden="true"]')) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
}

function role(el) {
  const r = el.getAttribute('role');
  if (r) return r;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'input') return el.type === 'checkbox' || el.type === 'radio' ? el.type : 'textbox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (/^h\d$/.test(tag)) return 'heading';
  return tag;
}

function describe(el, ref) {
  const name = el.getAttribute('aria-label') || el.getAttribute('title') || clip(el.innerText)
    || el.getAttribute('placeholder') || el.getAttribute('name') || '';
  const bits = [ref ? `[${ref}]` : '-', role(el), JSON.stringify(clip(name))];
  if ('value' in el && el.tagName !== 'BUTTON' && el.type !== 'checkbox') bits.push(`= ${JSON.stringify(clip(el.value, 120))}`);
  const state = [];
  if (el.checked || el.getAttribute('aria-checked') === 'true') state.push('checked');
  if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-state') === 'active') state.push('selected');
  if (el.getAttribute('aria-expanded') === 'true' || el.getAttribute('data-state') === 'open') state.push('open');
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') state.push('disabled');
  if (el === document.activeElement) state.push('focused');
  if (state.length) bits.push(`(${state.join(', ')})`);
  return bits.join(' ');
}

/** Numbered outline of what is on screen: interactive elements get a ref, landmarks are listed for context. */
export function snapshot(scope) {
  refs = new Map();
  const root = (scope && document.querySelector(scope)) || document.body;
  // An open modal hides the rest from the user, so only show the modal.
  // shortcut: treats every open dialog as modal; scope non-modal popovers out if one ever uses role=dialog.
  const modal = [...root.querySelectorAll('[role=dialog], [role=alertdialog]')].filter((d) => d.innerText.trim()).pop();
  const base = modal || root;
  const lines = [];
  for (const el of base.querySelectorAll(`${INTERACTIVE}, ${LANDMARK}`)) {
    if (!visible(el) || el.closest('.xterm-helpers')) continue;
    if (el.matches(INTERACTIVE)) {
      const ref = refs.size + 1;
      refs.set(ref, el);
      lines.push(describe(el, ref));
    } else {
      lines.push(describe(el, null));
    }
  }
  if (modal) lines.unshift('(a modal dialog is open; only its contents are listed)');
  return lines.join('\n') || '(nothing visible)';
}

function target(ref) {
  const el = refs.get(Number(ref));
  if (!el) throw new Error(`no element [${ref}]; run \`lirah qa snapshot\` first`);
  if (!el.isConnected) throw new Error(`element [${ref}] is gone; run \`lirah qa snapshot\` again`);
  return el;
}

const settle = () => new Promise((r) => setTimeout(r, 250));

/** Click like a user: Radix menus open on pointerdown, so send the whole sequence. */
export async function click(ref) {
  const el = target(ref);
  el.scrollIntoView?.({ block: 'center' });
  const opts = { bubbles: true, cancelable: true, composed: true, button: 0, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.focus?.();
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
  await settle();
  return `clicked ${describe(el, Number(ref))}`;
}

/** Replace a field's text, the way React sees typing. */
export async function type(ref, text) {
  const el = target(ref);
  el.focus();
  if (el.isContentEditable) {
    el.textContent = text;
  } else {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  return `typed into ${describe(el, Number(ref))}`;
}

/** Press a key or combo ("Enter", "Escape", "Ctrl+K", "Ctrl+Shift+P") on the focused element. */
export async function key(combo) {
  const parts = String(combo).split('+');
  const k = parts.pop();
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const init = {
    key: k.length === 1 ? k.toLowerCase() : k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
    ctrlKey: mods.has('ctrl'), shiftKey: mods.has('shift'), altKey: mods.has('alt'), metaKey: mods.has('meta') || mods.has('cmd'),
    bubbles: true, cancelable: true, composed: true,
  };
  const el = document.activeElement || document.body;
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
  await settle();
  return `pressed ${combo} on ${el === document.body ? 'the page' : describe(el, null)}`;
}

/** Visible text of an element ref, a CSS selector, or the whole page. */
export function text(what) {
  const el = what === undefined ? document.body : /^\d+$/.test(what) ? target(what) : document.querySelector(what);
  if (!el) throw new Error(`nothing matches ${what}`);
  return clip(el.innerText, 4000);
}

/** Wait until the page shows some text (or stops showing it with gone=true). */
export async function wait(needle, { timeout = 10, gone = false } = {}) {
  const end = Date.now() + Number(timeout) * 1000;
  for (;;) {
    const has = document.body.innerText.includes(needle);
    if (has !== gone) return `${gone ? 'gone' : 'found'}: ${needle}`;
    if (Date.now() > end) throw new Error(`timed out after ${timeout}s waiting for ${gone ? 'to lose' : ''} "${needle}"`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const terminals = () => [...document.querySelectorAll('*')].filter((el) => el.__xterm && visible(el)).map((el) => el.__xterm);

function pickTerminal(n = 1) {
  const list = terminals();
  const term = list[Number(n) - 1];
  if (!term) throw new Error(`no visible terminal #${n} (${list.length} visible)`);
  return term;
}

/** The last rows of a visible terminal's screen, as text. */
export function terminal(n = 1, rows = 40) {
  const term = pickTerminal(n);
  // Whole buffer, not the viewport: the viewport depends on layout, which a hidden window may not have.
  const buf = term.buffer.active;
  const out = [];
  for (let i = 0; i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '');
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.slice(-Number(rows)).join('\n') || `(terminal #${n} is empty, ${term.cols}x${term.rows})`;
}

/** Type into a visible terminal as the user would; "\r" (or a trailing --enter) submits. */
export async function terminalType(n, data) {
  pickTerminal(n).input(data, true);
  await settle();
  return `sent ${JSON.stringify(data)} to terminal #${n}`;
}
