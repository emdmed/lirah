// node test.mjs: self-check for Model.js (a QML .pragma library, loaded as a script).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('./Model.js', import.meta.url), 'utf8').replace('.pragma library', '');
const M = {};
vm.runInNewContext(src, M);

const reply = JSON.stringify({ ok: true, data: { tabs: [
  { id: 'a', name: 'a', agent: 'working', since: 100 },
  { id: 'b', name: 'b', agent: 'done', attention: true, since: 50 },
  { id: 'c', name: 'c', agent: 'permission', attention: true, since: 90, message: 'Bash\n rm' },
  { id: 'd', name: 'd', agent: null },
  { id: 'e', name: 'e', agent: 'waiting', attention: false },
], alerts: [{ seq: 3, title: 't', body: 'b', tabId: 'a' }] } });

const parsed = M.parseReply(reply);
assert.equal(parsed.ok, true);
const g = M.group(parsed.data.tabs);
assert.equal(g.needs.map((t) => t.id).join(), ['c', 'b'].join());
assert.equal(g.working.map((t) => t.id).join(), ['a'].join());
assert.equal(g.quiet.map((t) => t.id).join(), ['d', 'e'].join());
assert.equal(M.summary(g, true), '2 waiting · 1 working · 5 tabs');
assert.equal(M.summary({ needs: [], working: [], quiet: [{}] }, true), 'All quiet · 1 tab');
assert.equal(M.stateText(g.needs[0], 0), 'needs permission · Bash rm');
assert.equal(M.stateText({ agent: 'working', since: 0 }, 125000), 'working · 2m');
assert.equal(M.planText({ title: 'P', done: 4, total: 9, autopilot: 'running' }), 'P 4/9 · auto-pilot running');
assert.equal(M.parseReply('{"ok":false,"error":"nope"}').error, 'nope');
assert.equal(M.parseReply('garbage').ok, false);

// First poll takes the position without replaying; later ones return the new ones.
let r = M.freshAlerts(parsed.data.alerts, -1);
assert.equal(r.alerts.length, 0);
assert.equal(r.lastSeq, 3);
r = M.freshAlerts([{ seq: 3 }, { seq: 4, title: '<img src=x>', tabId: 'bad id;rm' }], r.lastSeq);
assert.equal(r.alerts.length, 1);
assert.equal(r.alerts[0].tabId, '');
assert.equal(r.lastSeq, 4);
assert.equal(M.clean('x'.repeat(500), 10).length, 10);
console.log('Model.js ok');
