// Features a prompt names, ported from promptFeatures in
// src-tauri/src/compaction/hook.js. The two must agree: change both together.
// A feature counts when its name, id or an alias (3+ chars) appears as whole
// words; at most 3 features and 40 files in total. Paths stay project-relative.
// shortcut: no existence check (the hook drops missing files first), so the
// 40-file budget can differ when the map lists deleted files; fine for display.
const FEATURES_MAX = 3;
const FEATURE_FILES_MAX = 40;

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function matchFeatures(map, prompt) {
  const features = map?.features;
  if (!Array.isArray(features)) return [];
  const text = ` ${words(prompt)} `;
  const hits = [];
  let budget = FEATURE_FILES_MAX;
  for (const f of features) {
    if (hits.length >= FEATURES_MAX || budget <= 0) break;
    const names = [f?.name, f?.id, ...(Array.isArray(f?.aliases) ? f.aliases : [])].map(words).filter((n) => n.length >= 3);
    const word = names.find((n) => text.includes(` ${n} `));
    if (!word) continue;
    const files = (Array.isArray(f.files) ? f.files : [])
      .filter((p) => typeof p === 'string' && !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..'))
      .slice(0, budget);
    budget -= files.length;
    hits.push({ id: f.id, name: String(f.name || f.id), word, files });
  }
  return hits;
}
