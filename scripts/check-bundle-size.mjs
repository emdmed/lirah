/**
 * Fails when the startup JavaScript grows past its budget.
 *
 * Reads dist/index.html (run `npm run build` first), so it measures exactly
 * what the webview loads before first paint: the entry chunk plus the vendor
 * chunks it modulepreloads. Lazy chunks (Babel, recharts, markdown, dialogs)
 * are not counted — keeping them out of startup is the point.
 *
 *   node scripts/check-bundle-size.mjs        (or: npm run check:bundle)
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows the latter yields "/D:/...".
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const ENTRY_BUDGET = 1.3 * 1024 * 1024;
const STARTUP_BUDGET = 1.6 * 1024 * 1024;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\/([^"]+\.js)"/)?.[1];
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\/([^"]+\.js)"/g)].map((m) => m[1]);
if (!entry) {
  console.error('No entry script found in dist/index.html — run `npm run build` first.');
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const size = (file) => statSync(join(DIST, file)).size;

const entrySize = size(entry);
let startup = entrySize;
console.log(`  ${kb(entrySize).padStart(10)}  ${entry} (entry)`);
for (const file of preloads) {
  const s = size(file);
  startup += s;
  console.log(`  ${kb(s).padStart(10)}  ${file}`);
}
console.log(`  ${kb(startup).padStart(10)}  total startup JS`);

let failed = false;
if (entrySize > ENTRY_BUDGET) {
  console.error(`FAIL entry chunk ${kb(entrySize)} exceeds ${kb(ENTRY_BUDGET)}`);
  failed = true;
}
if (startup > STARTUP_BUDGET) {
  console.error(`FAIL startup JS ${kb(startup)} exceeds ${kb(STARTUP_BUDGET)}`);
  failed = true;
}
if (failed) {
  console.error('Something heavy is being imported eagerly. Check for a static import of a lazy feature or a barrel re-export.');
  process.exit(1);
}
console.log('ok');
