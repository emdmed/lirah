import { useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Figure } from '../components/instrument/figure';
import { Fig06Context } from '../components/Fig06Context';
import { Fig13Agents } from '../components/Fig13Agents';
import { Fig15Drawing, Fig15Keys } from '../components/Fig15Keys';
import { Fig09Loop } from '../features/plans/Fig09Loop';
import { Fig16Chunks } from '../features/plans/Fig16Chunks';
import { Fig20Timeline } from '../features/plans/Fig20Timeline';
import { Fig21PlanGit } from '../features/plans/Fig21PlanGit';
import { Fig22FilesByChunk } from '../features/plans/Fig22FilesByChunk';
import { Fig11Merge } from '../features/git/Fig11Merge';
import { Fig12Race } from '../features/agent-jobs/Fig12Race';
import { Fig14Budget } from '../features/token-budget/Fig14Budget';
import { Fig10Drawing } from '../features/settings/Fig10Sandbox';
import { Fig19Detail } from '../features/file-analysis/Fig19Detail';
import { boundKeysFor } from '../lib/shortcuts';
import { ProgressReadout } from '../features/plans/parts';

// Every FIG drawing with mock data, for eyeballing them across themes.
// Mounted instead of the app when the URL carries `?figs` (dev only, see
// main.jsx); `&theme=<key>` picks the theme on load.

const MIN = 60_000;
const NOW = Date.now();
const ROOT = '/home/enrique/projects/nevo-terminal';
const WT = '/home/enrique/.lirah/plan-worktrees/calibrated-figures-p7k2/nevo-terminal';

const TITLES = [
  'Figure kit tokens', 'Context ruler', 'Auto-pilot loop', 'Sandbox map', 'Merge preview',
  'Race lanes', 'Subagent fan', 'Budget ruler', 'Keyboard plate', 'Chunk ruler',
  'Plan timeline', 'Plan git lanes', 'Files by chunk', 'Detail levels in file chip popover',
];

// Six chunks done with a gap (≈ break) before chunk 4, chunk 7 running,
// chunk 8 skipped, the rest pending.
function makePlan({ allDone = false } = {}) {
  const durs = [6, 11, 4, 23, 8, 9];
  let t = NOW - 140 * MIN;
  const chunks = TITLES.slice(0, 12).map((title, i) => {
    const n = i + 1;
    const c = { id: `c${n}`, n, title, status: 'pending', startedAt: null, doneAt: null, commits: [], commitsByRepo: {} };
    if (allDone || i < durs.length) {
      if (i === 3) t += 18 * MIN; // idle break
      const d = (durs[i] ?? 7) * MIN;
      c.status = 'implemented';
      c.startedAt = t;
      c.doneAt = t + d;
      c.commits = [`sha${n}`];
      c.commitsByRepo = { [ROOT]: [`sha${n}`] };
      t += d + 30_000;
    } else if (i === 6) {
      c.status = 'in-progress';
      c.startedAt = NOW - 7 * MIN;
      c.tabId = 't1';
    } else if (i === 7) {
      c.status = 'skipped';
    }
    return c;
  });
  return {
    id: 'p7k2',
    slug: 'calibrated-figures',
    title: 'Calibrated figures, plan A: draw',
    repoRoot: ROOT,
    clearBetweenChunks: false,
    createdAt: NOW - 150 * MIN,
    git: {
      worktrees: true,
      branch: 'plan/calibrated-figures-plan-a-draw',
      repos: [{ root: ROOT, base: 'main', workPath: WT, prepared: true }],
      workDir: WT,
      preparedAt: NOW - 145 * MIN,
    },
    autopilot: allDone
      ? { status: 'done', tabId: 't1', startedAt: NOW - 141 * MIN, endedAt: t }
      : { status: 'running', tabId: 't1', startedAt: NOW - 141 * MIN, nudged: false },
    chunks,
  };
}

// A run that just started: chunk 1 live for 14s, nothing committed, worked in
// place on a long base branch, fresh context per chunk.
function makeStartPlan() {
  const chunks = TITLES.slice(0, 12).map((title, i) => ({
    id: `s${i + 1}`, n: i + 1, title, status: i === 0 ? 'in-progress' : 'pending',
    startedAt: i === 0 ? NOW - 14_000 : null, doneAt: null, commits: [], commitsByRepo: {}, tabId: i === 0 ? 't1' : undefined,
  }));
  return {
    id: 'p0m5', slug: 'improvement-plan', title: 'Improvement plan — agentic orchestration workflows', repoRoot: ROOT,
    clearBetweenChunks: true, createdAt: NOW - 5 * MIN,
    git: { worktrees: false, branch: 'plan/improvement-plan-agentic-orche', repos: [{ root: ROOT, base: 'fix/hooks-hardening', prepared: true }], workDir: ROOT, preparedAt: NOW - MIN },
    autopilot: { status: 'running', tabId: 't1', startedAt: NOW - 15_000, nudged: false },
    chunks,
  };
}

const PLAN = makePlan();
const PLAN_START = makeStartPlan();
const PLAN_DONE = makePlan({ allDone: true });
// Auto-pilot turned off with chunk 7 sent but never committed: the stuck state.
const PLAN_STUCK = {
  ...PLAN,
  autopilot: { status: 'off', tabId: 't1', startedAt: PLAN.autopilot.startedAt },
  chunks: PLAN.chunks.map((c) => (c.status === 'in-progress' ? { ...c, needsCommit: true } : c)),
};
const LIVE = PLAN.chunks.find((c) => c.status === 'in-progress');

const FILES = {
  loading: false,
  byRepo: {
    c1: { [ROOT]: ['src/components/instrument/figure/kit.jsx', 'src/index.css'] },
    c2: { [ROOT]: ['src/components/Fig06Context.jsx', 'src/components/instrument/figure/kit.jsx'] },
    c3: { [ROOT]: ['src/features/plans/Fig09Loop.jsx', 'src/index.css'] },
    c4: { [ROOT]: ['src/features/settings/Fig10Sandbox.jsx', 'src/components/instrument/figure/kit.jsx', 'src/index.css'] },
    c5: { [ROOT]: ['src/features/git/Fig11Merge.jsx', 'src/features/git/MergeDialog.jsx'] },
    c6: { [ROOT]: ['src/features/agent-jobs/Fig12Race.jsx', 'src/components/instrument/figure/registry.js', 'src/components/instrument/figure/index.js', 'src/lib/formatDuration.js', 'src/hooks/useTick.js', 'CHANGELOG.md', 'DESIGN.md'] },
  },
};

const TOKEN_USAGE = {
  session_id: '5f3a9c21-8e0b-4d6f-a1c2-77b0e4d19c3e',
  model: 'claude-opus-4-1',
  context_tokens: 86_400,
  last_cache_read_tokens: 71_200,
  last_cache_creation_tokens: 9_100,
  last_input_tokens: 6_100,
};

const SPEC = {
  writable: ['/home/enrique', ROOT],
  protected: ['/home/enrique/.ssh', '/home/enrique/.gnupg', '/home/enrique/.aws', '/home/enrique/.config/gh', '/home/enrique/.netrc', '/home/enrique/.docker', '/home/enrique/.kube'],
  tmp_private: true,
  unshare: ['pid', 'ipc', 'uts'],
  cleared_env: true,
  env_passthrough: ['PATH', 'HOME', 'TERM', 'LANG', 'EDITOR'],
  net_isolated: true,
};

const MERGE = {
  ff: false,
  behind: 2,
  commits: Array.from({ length: 11 }, (_, i) => `sha${i}`),
  diffStat: { files: 14, added: 820, removed: 96 },
  switchNeeded: true,
  mergeDir: ROOT,
  featureWorktree: WT,
};
const MERGE_FF = { ff: true, behind: 0, commits: ['a', 'b', 'c', 'd'], diffStat: { files: 3, added: 41, removed: 7 }, switchNeeded: false, mergeDir: ROOT };

const JOBS = [
  { id: 'j1', label: 'Fix flaky figure test · claude', cli: 'claude', status: 'done', startedAt: NOW - 9 * MIN, endedAt: NOW - 3 * MIN, typecheck: { status: 'done', errorCount: 0 }, diffStat: { added: 42, removed: 7 } },
  { id: 'j2', label: 'Fix flaky figure test · codex', cli: 'codex', status: 'running', startedAt: NOW - 9 * MIN, typecheck: null, diffStat: null },
  { id: 'j3', label: 'Fix flaky figure test · gemini', cli: 'gemini', status: 'done', startedAt: NOW - 9 * MIN, endedAt: NOW - 5 * MIN, typecheck: { status: 'done', errorCount: 3 }, diffStat: { added: 118, removed: 40 } },
  { id: 'j4', label: 'Fix flaky figure test · opencode', cli: 'opencode', status: 'failed', startedAt: NOW - 8 * MIN, endedAt: NOW - 6 * MIN, typecheck: null, diffStat: null },
];

const iso = (t) => new Date(t).toISOString();
const AGENTS = [
  { agent_id: 'a1b2c3d4e5', description: 'Audit figure colours in light themes', status: 'running', started_at: iso(NOW - 4 * MIN), last_activity: iso(NOW - 5000), last_tool: 'Read', message_count: 14 },
  { agent_id: 'b2c3d4e5f6', description: 'Find every hard-coded hex in src/components', status: 'running', started_at: iso(NOW - 2 * MIN), last_activity: iso(NOW - 9000), last_tool: 'Grep', message_count: 6 },
  { agent_id: 'c3d4e5f6a7', description: 'Check the live star glow', status: 'done', started_at: iso(NOW - 12 * MIN), last_activity: iso(NOW - 6 * MIN), last_tool: 'Bash', message_count: 22 },
  { agent_id: 'd4e5f6a7b8', description: 'Measure fallback widths', status: 'done', started_at: iso(NOW - 20 * MIN), last_activity: iso(NOW - 15 * MIN), last_tool: 'Edit', message_count: 9 },
];

const today = new Date();
today.setHours(15, 20, 0, 0);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const BUDGET_ROWS = [{ date: ymd(today), billable_input_tokens: 820_000, billable_output_tokens: 300_000 }];

const LEVELS = { whole: 3400, symbols: 180, signatures: 620, skeleton: 1500 };

function fig15Height(mod) {
  const n = boundKeysFor(mod).length;
  return Math.max(142 + 24, 34 + 12 + Math.max(0, n - 1) * 18) + 30;
}

const fb = (text) => <div className="font-mono text-[11px] text-muted-foreground">[fallback] {text}</div>;

// Each figure as a render function, so the narrow row can reuse it.
const FIGS = [
  { n: 6, w: 288, paper: 'var(--ins-raised)', el: () => <Fig06Context tokenUsage={TOKEN_USAGE} fallback={fb('context 86k / 200k')} /> },
  { n: 9, w: 400, paper: 'var(--ins-well)', el: () => <Fig09Loop plan={PLAN} pos={{ chunk: LIVE, index: 7, total: 11 }} elapsed="41m" fallback={fb('auto-pilot chunk 7/11')} /> },
  { n: 10, w: 460, el: () => <Fig10Drawing spec={SPEC} tabName="nevo-terminal" paper="var(--ins-panel)" fallback={fb('sandbox: / ro, ~ rw')} /> },
  { n: 11, w: 640, el: () => <Fig11Merge feature="plan/calibrated-figures-plan-a-draw" base="main" plan={MERGE} fallback={fb('merge commit, 11 commits')} /> },
  { n: '11b', w: 640, el: () => <Fig11Merge feature="fix/glow" base="main" plan={MERGE_FF} fallback={fb('fast-forward, 4 commits')} /> },
  { n: 12, w: 560, el: () => <Fig12Race jobs={JOBS} fallback={fb('race: 4 agents')} /> },
  { n: '12s', w: 260, el: () => <Fig12Race jobs={JOBS} short fallback={fb('race: 4 agents')} /> },
  { n: 13, w: 300, paper: 'var(--color-sidebar, var(--ins-panel))', el: () => <Fig13Agents agents={AGENTS} now={NOW} onDismiss={() => {}} onOpenList={() => {}} renderCard={() => null} fallback={fb('2 subagents running')} /> },
  { n: 14, w: 380, el: () => <Fig14Budget kind="daily" limit={2_000_000} used={1_120_000} rows={BUDGET_ROWS} now={today} fallback={fb('daily 56%')} /> },
  { n: '14w', w: 380, el: () => <Fig14Budget kind="weekly" limit={10_000_000} used={9_700_000} rows={[]} fallback={fb('weekly 97%')} /> },
  { n: 15, w: 520, el: () => <Fig15Keys /> },
  {
    n: '15s', w: 520, el: () => (
      <Figure fig="keys" title="HOLD ^⇧" viewBox={`0 0 520 ${fig15Height('ctrl+shift')}`} paper="var(--ins-panel)">
        <Fig15Drawing mod="ctrl+shift" />
      </Figure>
    ),
  },
  { n: 16, w: 480, paper: 'var(--ins-well)', el: () => <Fig16Chunks plan={PLAN} label="chunks" fallback={fb('▮▮▮▮▮▮▯▯▯▯▯▯')} /> },
  { n: '9s', w: 520, paper: 'var(--ins-well)', el: () => <Fig09Loop plan={PLAN_START} pos={{ chunk: PLAN_START.chunks[0], index: 1, total: 12 }} elapsed="14s" fallback={fb('auto-pilot chunk 1/12')} /> },
  { n: '20s', w: 520, el: () => <Fig20Timeline plan={PLAN_START} fallback={fb('timeline: 0/12')} /> },
  { n: '21s', w: 520, el: () => <Fig21PlanGit plan={PLAN_START} fallback={fb('plan/… · in place')} /> },
  { n: 20, w: 560, el: () => <Fig20Timeline plan={PLAN} fallback={fb('timeline: elapsed 2h')} /> },
  { n: '20x', w: 520, el: () => <Fig20Timeline plan={PLAN_STUCK} fallback={fb('timeline: stuck')} /> },
  { n: '20xn', w: 300, el: () => <Fig20Timeline plan={PLAN_STUCK} fallback={fb('timeline: stuck')} /> },
  { n: '20d', w: 560, el: () => <Fig20Timeline plan={PLAN_DONE} fallback={fb('timeline: complete')} /> },
  { n: 21, w: 480, el: () => <Fig21PlanGit plan={PLAN} fallback={fb('plan/… · 6 commits')} /> },
  { n: '21d', w: 480, el: () => <Fig21PlanGit plan={PLAN_DONE} fallback={fb('plan/… · ready')} /> },
  { n: 22, w: 360, el: () => <Fig22FilesByChunk plan={PLAN} files={FILES} /> },
  { n: 19, w: 360, el: () => <Fig19Detail name="Fig20Timeline.jsx" lineCount={284} levels={LEVELS} chosen="signatures" defaultLevel="skeleton" paper="var(--ins-panel)" /> },
];

// Narrow copies: everything should fall back (or render nothing, FIG 19) at 170px.
const NARROW = 170;

function Card({ fig, width }) {
  return (
    <div
      data-fig={fig.n}
      className="border border-[var(--ins-edge,#888)] p-3"
      style={{ width: width + 26, background: fig.paper ?? 'var(--ins-panel)' }}
    >
      <div className="mb-1 font-mono text-[10px] text-muted-foreground">FIG {fig.n} · {width}px</div>
      {fig.el()}
    </div>
  );
}

export function FigureSheet() {
  const { currentTheme, themes, changeTheme } = useTheme();

  // `?figs&theme=flexoki` picks the theme for headless screenshots.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('theme');
    if (t && themes[t]) changeTheme(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[var(--ins-gutter)] p-4 text-xs font-mono text-foreground">
      <div className="mb-4 flex items-center gap-3">
        <span className="ins-legend">Figure sheet</span>
        <select
          value={currentTheme}
          onChange={(e) => changeTheme(e.target.value)}
          className="ins-well px-2 py-1 text-foreground"
        >
          {Object.entries(themes).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {FIGS.map((f) => <Card key={f.n} fig={f} width={f.w} />)}
      </div>

      <div className="mb-2 mt-6 ins-legend">Narrow ({NARROW}px): fallbacks</div>
      <div className="flex flex-wrap items-start gap-3">
        {FIGS.map((f) => <Card key={f.n} fig={f} width={NARROW} />)}
      </div>

      <div className="mb-2 mt-6 ins-legend">Round 3 · lane C</div>
      <div className="flex flex-wrap items-start gap-3">
        {LANE_C.map((f) => <Card key={f.n} fig={f} width={f.w} />)}
      </div>
    </div>
  );
}

// round 3 · lane C
const progress = (plan) => {
  const active = plan.chunks.filter((c) => c.status !== 'skipped');
  return { done: active.filter((c) => c.status === 'implemented').length, total: active.length };
};
const PLAN_LONG = {
  ...PLAN,
  chunks: Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, n: i + 1, status: i < 23 ? 'implemented' : i === 23 ? 'in-progress' : 'pending' })),
};
const PLAN_PAUSED = { ...PLAN, autopilot: { ...PLAN.autopilot, status: 'paused', chunkId: LIVE.id } };
const P4 = (plan, paper) => () => <ProgressReadout plan={plan} {...progress(plan)} paper={paper} />;
const LANE_C = [
  { n: 'P4 running', w: 300, el: P4(PLAN) },
  { n: 'P4 needs you', w: 300, el: P4(PLAN_STUCK) },
  { n: 'P4 paused', w: 300, paper: 'var(--ins-well)', el: P4(PLAN_PAUSED, 'var(--ins-well)') },
  { n: 'P4 done', w: 300, el: P4(PLAN_DONE) },
  { n: 'P4 40 chunks', w: 300, el: P4(PLAN_LONG) },
  { n: 'P4 narrow', w: 120, el: P4(PLAN_LONG) },
];
