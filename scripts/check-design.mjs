/**
 * Checks for the Design View spec model and layered layout.
 *
 * These modules are pure functions with no DOM or Tauri dependency, so they can
 * be exercised directly with node — no test runner in this project.
 *
 *   node scripts/check-design.mjs        (or: npm run check:design)
 *
 * The Rust half of the feature (the transcript digest) is covered by
 * `cargo test --lib design::` in src-tauri.
 */
import { validateSpec, normalizeSpec, parseSpecJson } from '../src/features/design/spec.js';
import { buildConceptModel, formOf } from '../src/features/design/conceptModel.js';
import { layoutDesign, wrapText } from '../src/features/design/designLayout.js';
import { parseStreamLine, createEventLog, MAX_EVENTS } from '../src/features/design/designEvents.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
};

const good = {
  title: 'Agent job execution',
  summary: 'How a headless job runs.',
  layers: [
    { id: 'ui', label: 'Frontend', order: 0 },
    { id: 'core', label: 'Tauri core', order: 1 },
    { id: 'fs', label: 'Filesystem', order: 2 },
  ],
  nodes: [
    { id: 'jobs-ctx', label: 'AgentJobsContext', layer: 'ui', kind: 'store', status: 'existing',
      responsibility: 'Holds job state and streams output into the sidebar for each running job',
      owns: ['job list', 'output ring buffer'], files: ['src/features/agent-jobs/AgentJobsContext.jsx'] },
    { id: 'runner', label: 'agent_runner', layer: 'core', kind: 'service', status: 'existing',
      responsibility: 'Spawns the headless CLI and streams its stdout back as events',
      owns: ['child process handles'], files: ['src-tauri/src/agent_runner/commands.rs'] },
    { id: 'digest', label: 'session digest', layer: 'core', kind: 'module', status: 'proposed',
      responsibility: 'Compacts a session transcript down to text plus tool targets',
      owns: [], files: ['src-tauri/src/design/digest.rs'] },
    { id: 'log', label: 'run log', layer: 'fs', kind: 'db', status: 'existing',
      responsibility: 'Persists the full output stream so it survives a reload', owns: ['~/.lirah/jobs'], files: [] },
  ],
  flows: [
    { id: 'run', label: 'User runs a job', steps: [
      { from: 'jobs-ctx', to: 'runner', data: 'JobSpec { prompt, cwd, useWorktree }' },
      { from: 'runner', to: 'log', data: 'stdout lines' },
      { from: 'runner', to: 'jobs-ctx', data: 'agent-job://output { jobId, chunk }' },
    ]},
    { id: 'design', label: 'Diagram a conversation', steps: [
      { from: 'digest', to: 'runner', data: 'digest.md path' },
      { from: 'jobs-ctx', to: 'runner', data: 'JobSpec { prompt, cwd }' },
    ]},
  ],
  concerns: [{ node: 'runner', kind: 'risk', text: 'auto permission mode can still stall on risky actions' }],
  concepts: {
    summary: 'You ask for a job, it runs on its own, and you watch the output arrive.',
    data: [
      { id: 'job-spec', label: 'Job request', shape: 'JobSpec { prompt, cwd, useWorktree }',
        what: 'What you want run and where to run it.', nodes: ['jobs-ctx'] },
      { id: 'output-chunk', label: 'Output chunk', shape: 'agent-job://output { jobId, chunk }',
        what: 'A slice of the running job’s output, as it appears.', nodes: ['runner'] },
      { id: 'run-log', label: 'Run log', shape: 'text file on disk', livesIn: '~/.lirah/jobs/<id>.log',
        what: 'The whole output, kept so it survives a reload.', nodes: ['log'] },
    ],
    stages: [
      { id: 'ask', label: 'You ask for a job', actor: 'Frontend', does: 'You write a prompt and pick a folder.',
        produces: ['job-spec'], nodes: ['jobs-ctx'] },
      { id: 'run', label: 'It runs headless', actor: 'Tauri core', does: 'The CLI is spawned and its output is streamed back.',
        consumes: ['job-spec'], produces: ['output-chunk', 'run-log'], nodes: ['runner'] },
      { id: 'watch', label: 'You watch it', actor: 'Frontend', does: 'Each chunk lands in the sidebar as it arrives.',
        consumes: ['output-chunk'], nodes: ['jobs-ctx'] },
    ],
  },
};

console.log('validateSpec — valid spec');
const okResult = validateSpec(good);
check('accepts a well-formed spec', okResult.ok, JSON.stringify(okResult.errors));
check('no spurious warnings', okResult.warnings.length === 0, JSON.stringify(okResult.warnings));

console.log('validateSpec — catches real mistakes');
const bad = structuredClone(good);
bad.nodes[0].layer = 'nope';
bad.nodes[1].responsibility = '';
bad.flows[0].steps[1].to = 'ghost';
bad.nodes[3].id = 'runner'; // duplicate
delete bad.title;
const badResult = validateSpec(bad);
const paths = badResult.errors.map(e => e.path);
check('rejects invalid spec', !badResult.ok);
check('flags bad layer ref', paths.includes('nodes[0].layer'), JSON.stringify(paths));
check('flags empty responsibility', paths.includes('nodes[1].responsibility'), JSON.stringify(paths));
check('flags unknown step target', paths.includes('flows[0].steps[1].to'), JSON.stringify(paths));
check('flags duplicate node id', paths.includes('nodes[3].id'), JSON.stringify(paths));
check('flags missing title', paths.includes('title'), JSON.stringify(paths));

console.log('normalizeSpec');
const norm = normalizeSpec(good);
check('layers sorted by order', norm.layers.map(l => l.id).join(',') === 'ui,core,fs');
check('nodes is a Map', norm.nodes instanceof Map && norm.nodes.size === 4);
check('unknown kind coerced to module', normalizeSpec({ ...good, nodes: [{ ...good.nodes[0], kind: 'weird' }] }).nodes.get('jobs-ctx').kind === 'module');
// jobs-ctx -> runner appears in BOTH flows: must dedupe into one edge with both contracts
const dup = norm.edges.filter(e => e.key === 'jobs-ctx->runner');
check('duplicate edge deduped', dup.length === 1, `got ${dup.length}`);
check('both contracts kept on shared edge', dup[0]?.contracts.length === 2, JSON.stringify(dup[0]?.contracts));
check('edge remembers both flows', dup[0]?.flows.length === 2);
check('total distinct edges', norm.edges.length === 4, `got ${norm.edges.length}`);
// runner -> jobs-ctx is an upward (feedback) edge and must be kept separate from jobs-ctx -> runner
check('reverse direction is its own edge', norm.edges.some(e => e.key === 'runner->jobs-ctx'));

console.log('parseSpecJson');
check('bare json', parseSpecJson('{"a":1}').a === 1);
check('fenced json', parseSpecJson('here you go:\n```json\n{"a":2}\n```\ndone').a === 2);
check('json with trailing prose', parseSpecJson('{"a":3}\n\nI wrote 4 nodes.').a === 3);
try { parseSpecJson('total garbage'); check('throws on garbage', false); }
catch { check('throws on garbage', true); }

console.log('wrapText');
check('wraps to budget', wrapText('one two three four five six seven eight', 12).every(l => l.length <= 12));
check('caps line count', wrapText('a '.repeat(200), 12).length === 3);
check('ellipsizes when truncated', wrapText('a '.repeat(200), 12)[2].endsWith('…'));
check('empty in, empty out', wrapText('', 20).length === 0);
check('single short line untouched', wrapText('short', 20).join('') === 'short');

console.log('layoutDesign');
const { positioned, bandRects, totalW, totalH } = layoutDesign(norm.layers, norm.nodes, norm.edges);
check('every node positioned', positioned.size === 4);
check('one band per layer', bandRects.length === 3);
check('bands stack downward', bandRects[0].y < bandRects[1].y && bandRects[1].y < bandRects[2].y);
check('bands do not overlap', bandRects[0].y + bandRects[0].h <= bandRects[1].y);
const byBand = id => positioned.get(id).band;
check('node in its declared layer band', byBand('jobs-ctx') === 0 && byBand('runner') === 1 && byBand('log') === 2);
check('same-band nodes do not overlap horizontally', (() => {
  const row = [...positioned.entries()].filter(([, r]) => r.band === 1).map(([, r]) => r).sort((a, b) => a.x - b.x);
  return row.every((r, i) => i === 0 || row[i - 1].x + row[i - 1].w <= r.x);
})());
check('positive canvas size', totalW > 0 && totalH > 0);
check('nodes inside canvas', [...positioned.values()].every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= totalW));

console.log('layoutDesign — hidden layers');
const hidden = layoutDesign(norm.layers, norm.nodes, norm.edges, new Set(['core']));
check('hidden layer band dropped', hidden.bandRects.length === 2);
check('hidden layer nodes dropped', hidden.positioned.size === 2 && !hidden.positioned.has('runner'));
check('remaining bands still stack', hidden.bandRects[0].y < hidden.bandRects[1].y);

console.log('edge routing');
const routes = layoutDesign(norm.layers, norm.nodes, norm.edges).routes;
check('one route per edge', routes.length === norm.edges.length, `got ${routes.length}`);
check('every route has a path', routes.every(r => r.path.startsWith('M') && r.path.length > 10));

// The whole point of routing through channels: no arrow may cross a box it is
// not attached to. Sample each path densely and test every sampled point.
const samplePoints = (d) => {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let s = 1; s < steps; s++) {
      out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  return out;
};
const collisions = routes.flatMap(r =>
  samplePoints(r.path).flatMap(p =>
    [...positioned.entries()]
      .filter(([id]) => id !== r.edge.from && id !== r.edge.to)
      .filter(([, b]) => p.x > b.x + 2 && p.x < b.x + b.w - 2 && p.y > b.y + 2 && p.y < b.y + b.h - 2)
      .map(([id]) => `${r.key} through ${id}`)
  )
);
check('no arrow crosses an unrelated node', collisions.length === 0, collisions.slice(0, 3).join(', '));

// Labels hang in the gutters, so they must never land inside a box either.
const labelHits = routes.filter(r =>
  [...positioned.values()].some(b =>
    r.labelX > b.x && r.labelX < b.x + b.w && r.labelY > b.y && r.labelY < b.y + b.h
  )
);
check('no contract label sits on a node', labelHits.length === 0, labelHits.map(r => r.key).join(', '));

console.log('change axis');
check('proposed node defaults to added', norm.nodes.get('digest').change === 'added');
check('existing node defaults to untouched', norm.nodes.get('runner').change === 'untouched');
check('declared change is kept', normalizeSpec({
  ...good,
  nodes: [{ ...good.nodes[1], change: 'modified' }],
}).nodes.get('runner').change === 'modified');
check('nonsense change falls back', normalizeSpec({
  ...good,
  nodes: [{ ...good.nodes[1], change: 'rewritten' }],
}).nodes.get('runner').change === 'untouched');
check('validator rejects an unknown change', (() => {
  const spec = structuredClone(good);
  spec.nodes[0].change = 'deleted';
  return validateSpec(spec).errors.some(e => e.path === 'nodes[0].change');
})());


// ---------------------------------------------------------------------------
// designEvents — shapes below are copied from a real
// `claude -p --output-format stream-json --verbose` run.
// ---------------------------------------------------------------------------
console.log('parseStreamLine');
const one = (l) => parseStreamLine(JSON.stringify(l));

check('init reports model and tool count', (() => {
  const [e] = one({ type: 'system', subtype: 'init', model: 'claude-opus-5', tools: ['Read','Bash'], permissionMode: 'auto' });
  return e.kind === 'init' && e.label.includes('claude-opus-5') && e.detail.includes('2 tools');
})());

check('tool_use shows name and file path', (() => {
  const [e] = one({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/a.js' } }] } });
  return e.kind === 'tool' && e.label === 'Read' && e.detail === 'src/a.js';
})());

check('tool_use falls back to the command for Bash', (() => {
  const [e] = one({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cargo test\nsecond line' } }] } });
  return e.detail === 'cargo test';
})());

check('assistant text becomes a say entry', (() => {
  const [e] = one({ type: 'assistant', message: { content: [{ type: 'text', text: "I'll read the file." }] } });
  return e.kind === 'say' && e.label === "I'll read the file.";
})());

check('thinking blocks produce nothing', one({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] } }).length === 0);

check('tool_result marks completion', one({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } })[0].kind === 'tool-done');
check('failed tool_result is flagged', (() => {
  const [e] = one({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }] } });
  return e.kind === 'tool-error' && e.level === 'warn';
})());

check('hook start and finish are surfaced', (() => {
  const [a] = one({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup', hook_event: 'SessionStart' });
  const [b] = one({ type: 'system', subtype: 'hook_response', hook_name: 'X', exit_code: 0 });
  return a.kind === 'hook' && a.label.includes('SessionStart') && b.label.includes('done');
})());
check('failing hook is a warning', (() => {
  const [e] = one({ type: 'system', subtype: 'hook_response', hook_name: 'X', exit_code: 2, stderr: 'boom' });
  return e.level === 'warn' && e.detail === 'boom';
})());

// A healthy run emits these constantly with status "allowed" — showing them
// would make a working run look broken.
check('allowed rate-limit reports are silent', one({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }).length === 0);
check('real rate limiting is surfaced', (() => {
  const [e] = one({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour' } });
  return e.level === 'warn' && e.label.includes('rejected');
})());

check('result carries duration, turns and cost', (() => {
  const [e] = one({ type: 'result', subtype: 'success', duration_ms: 6974, num_turns: 2, total_cost_usd: 0.3229 });
  return e.kind === 'result' && e.detail.includes('7s') && e.detail.includes('2 turns') && e.detail.includes('$0.32');
})());
check('errored result is flagged', one({ type: 'result', is_error: true, duration_ms: 10 })[0].level === 'warn');

// stderr is merged into the same stream, so non-JSON must survive — it is
// exactly what a stuck run needs to show.
check('non-JSON line is kept as raw', (() => {
  const [e] = parseStreamLine('command not found: claude');
  return e.kind === 'raw' && e.label === 'command not found: claude';
})());
check('malformed JSON is kept as raw', parseStreamLine('{"type":"assist')[0].kind === 'raw');
check('blank line is dropped', parseStreamLine('   ').length === 0);

console.log('createEventLog');
{
  const log = createEventLog();
  let notified = 0;
  const unsub = log.subscribe(() => { notified++; });
  const before = log.getSnapshot();
  log.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.js' } }] } }));
  check('snapshot is stable until flushed', log.getSnapshot() === before);
  log.flushNow();
  const after = log.getSnapshot();
  check('flush notifies subscribers', notified === 1);
  check('flush produces a new snapshot identity', after !== before);
  check('tool counter increments', after.counters.tools === 1);
  check('event carries a timestamp', typeof after.events[0].at === 'number');

  log.push(JSON.stringify({ type: 'result', num_turns: 4, total_cost_usd: 1.5, duration_ms: 100 }));
  log.flushNow();
  check('result fills turns and cost', log.getSnapshot().counters.turns === 4 && log.getSnapshot().counters.costUsd === 1.5);

  log.reset();
  check('reset clears events and counters', log.getSnapshot().events.length === 0 && log.getSnapshot().counters.tools === 0);
  unsub();
  log.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }));
  log.flushNow();
  check('unsubscribe stops notifications', notified === 3, `notified=${notified}`);
}

// The log must stay bounded across a long run.
{
  const log = createEventLog();
  for (let i = 0; i < MAX_EVENTS + 50; i++) {
    log.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `line ${i}` }] } }));
  }
  log.flushNow();
  const { events } = log.getSnapshot();
  check('log is capped at MAX_EVENTS', events.length === MAX_EVENTS, `got ${events.length}`);
  check('cap keeps the newest events', events[events.length - 1].label === `line ${MAX_EVENTS + 49}`);
}


console.log('concepts — validation');
{
  const noConcepts = structuredClone(good);
  delete noConcepts.concepts;
  const r = validateSpec(noConcepts);
  check('a spec without concepts is still valid', r.ok, JSON.stringify(r.errors));
  check('missing concepts warns instead', r.warnings.some(w => w.includes('concepts view will be derived')),
    JSON.stringify(r.warnings));

  const badC = structuredClone(good);
  badC.concepts.data[0].shape = '';
  badC.concepts.data[1].what = '   ';
  badC.concepts.data[2].id = 'job-spec';                 // duplicate
  badC.concepts.stages[1].consumes = ['ghost-data'];     // unknown datum
  badC.concepts.stages[2].nodes = ['ghost-node'];        // unknown node
  badC.concepts.stages[0].does = '';
  const cp = validateSpec(badC).errors.map(e => e.path);
  check('flags empty data shape', cp.includes('concepts.data[0].shape'), JSON.stringify(cp));
  check('flags empty data definition', cp.includes('concepts.data[1].what'), JSON.stringify(cp));
  check('flags duplicate data id', cp.includes('concepts.data[2].id'), JSON.stringify(cp));
  check('flags unknown consumed datum', cp.includes('concepts.stages[1].consumes'), JSON.stringify(cp));
  check('flags unknown linked node', cp.includes('concepts.stages[2].nodes'), JSON.stringify(cp));
  check('flags missing stage description', cp.includes('concepts.stages[0].does'), JSON.stringify(cp));

  const orphan = structuredClone(good);
  orphan.concepts.data.push({ id: 'stray', label: 'Stray', shape: 'string', what: 'Nothing reads this.' });
  const orphanResult = validateSpec(orphan);
  check('unwired datum is a warning, not an error', orphanResult.ok, JSON.stringify(orphanResult.errors));
  check('unwired datum is reported', orphanResult.warnings.some(w => w.includes('"stray"')),
    JSON.stringify(orphanResult.warnings));
}

console.log('concepts — authored model');
{
  const model = buildConceptModel(normalizeSpec(good));
  check('model is usable', model.ok);
  check('model is not derived', model.derived === false);
  check('stages keep source order', model.stages.map(s => s.id).join(',') === 'ask,run,watch');
  check('data resolved on stages', model.stages[1].consumesData[0]?.label === 'Job request');
  check('reverse links built', model.dataById.get('job-spec').consumedBy.map(s => s.id).join(',') === 'run');
  check('producers recorded', model.dataById.get('output-chunk').producedBy.map(s => s.id).join(',') === 'run');
  // job-spec is produced by `ask` and consumed by the *next* stage → a handoff.
  check('handoff is what the next stage reads', model.stages[0].handoff.map(d => d.id).join(',') === 'job-spec');
  // run-log is produced by `run` and read by nobody → terminal, not a handoff.
  check('unread output is terminal', model.stages[1].terminal.map(d => d.id).join(',') === 'run-log');
  check('handoff excludes terminal data', !model.stages[1].handoff.some(d => d.id === 'run-log'));
  check('system links filtered to real nodes', model.stages[1].systemNodes.join(',') === 'runner');
}

console.log('concepts — derived fallback');
{
  const bare = structuredClone(good);
  delete bare.concepts;
  const model = buildConceptModel(normalizeSpec(bare));
  check('derives a usable model', model.ok);
  check('says it is derived', model.derived === true);
  check('stages come from layers', model.stages.map(s => s.id).join(',') === 'ui,core,fs');
  check('layer members become system links', model.stages[0].systemNodes.join(',') === 'jobs-ctx');
  // Two flows carry `JobSpec { prompt, cwd, useWorktree }` and `JobSpec { prompt, cwd }` —
  // different strings, so different data. The same string twice must collapse to one.
  const labels = model.data.map(d => d.label);
  check('one datum per distinct contract', new Set(labels).size === labels.length, JSON.stringify(labels));
  check('no invented prose', model.stages.every(s => s.does === '') && model.data.every(d => d.what === ''));
  // Every derived datum came off an arrow, so both its ends must have landed on a
  // stage — an unwired one would mean a layer went missing on the way.
  check('every derived datum is wired both ways',
    model.data.every(d => d.producedBy.length > 0 && d.consumedBy.length > 0),
    JSON.stringify(model.data.map(d => [d.label, d.producedBy.length, d.consumedBy.length])));
  // The bottom layer only receives, so it must be a pure consumer.
  check('a receiving-only layer produces nothing',
    model.stages[2].produces.length === 0 && model.stages[2].consumes.length === 1);

  const empty = buildConceptModel(normalizeSpec({ ...bare, flows: [] }));
  check('no contracts to derive from is not ok', empty.ok === false);
  check('null spec is handled', buildConceptModel(null).ok === false);
}

console.log('concepts — data form inference');
check('a path is a file', formOf('~/.lirah/designs/spec.json', 'Spec') === 'file');
check('a typed shape is an object', formOf('JobSpec { prompt, cwd }', 'Job') === 'object');
check('an emitted name is an event', formOf('agent-job://output, emitted per chunk', 'Chunk') === 'event');
check('markdown is text', formOf('markdown text, ~45 KB', 'Digest') === 'text');
check('unknown falls back to value', formOf('a count', 'Count') === 'value');

console.log('pipeline stage events');
check('stage event is parsed', (() => {
  const [e] = parseStreamLine(JSON.stringify({ type: 'lirah_stage', label: 'Digest built', detail: '250 messages' }));
  return e.kind === 'stage' && e.label === 'Digest built' && e.detail === '250 messages';
})());
check('warn stage is distinguished', (() => {
  const [e] = parseStreamLine(JSON.stringify({ type: 'lirah_stage', label: 'Failed', detail: 'boom', level: 'warn' }));
  return e.kind === 'stage-warn' && e.level === 'warn';
})());
check('stages do not count as tool calls', (() => {
  const log = createEventLog();
  log.push(JSON.stringify({ type: 'lirah_stage', label: 'Spec valid' }));
  log.flushNow();
  return log.getSnapshot().counters.tools === 0 && log.getSnapshot().events.length === 1;
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
