import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../toast';
import { useConfirm } from '../dialogs/DialogProvider';
import { useTheme } from '../../contexts/ThemeContext';
import { getSettings, setSetting } from '../settings/settingsStore';
import { isProjectTab, masterTabOf, tabDisplayName, useTabManager } from '../tabs/TabContext';
import { useBookmarks } from '../bookmarks';
import { useTasksActions } from '../tasks/TasksContext';
import { GLOBAL, splitTaskText, TASK_STATUS } from '../tasks/taskModel';
import { resolveRepoRoot } from '../plans/planRepoRoot';
import { usePlansActions } from '../plans/PlansContext';
import { relToRepo, useAgentJobsActions } from '../agent-jobs/AgentJobsContext';
import { CHUNK_STATUS, effectiveChunkState, planProgress, planStage } from '../plans/planModel';
import { buildPlanRevisePrompt } from '../plans/planPrompts';
import { DEBUG_FIX, diagnosePlan, PENDING_PATCH } from '../plans/planDebug';
import { planGit } from '../plans/planGit';
import { getAgentHookState, getAgentTranscript, settleIfInterrupted, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabPrompt } from '../tabs/tabPrompts';
import { getTabTranscript } from '../../lib/terminalSessions';
import { getSessionTerminal, getTabSession } from '../tabs/terminalActivity';
import { keyBytes } from './keyNames';
import { outputSince, subscribeOutput, watchOutput } from '../tabs/outputTail';
import { hash8 } from '../../lib/ids';
import { JOB_CLIS } from '../../lib/agentClis';
import {
  addStartupProject, callerTab, clearStartupProjects, getSetting, getStartup, removeStartupProject, setStartupMode, isGuarded, listSettings, listTabs, listThemes, prepareReset, prepareSetting,
  resolveTab, resolveTabPath, resolveTheme, settingsSchema,
} from './actions';

// Worker tab id -> when the master last sent it a prompt; tabs.wait waits for a turn ending after it.
const sentAt = new Map();
// Worker tab id -> its last reply before the master's last send, to tell a fresh reply from it.
const replyBefore = new Map();
// Workers whose reply to the last send a wait already returned; `wait --any|--all` skips them.
const collected = new Set();
// Tab id -> the `wait --output` that last timed out, so its rerun misses nothing printed in between.
const outputWaits = new Map(); // { text, session, from, endedAt }

// Resolves true once check() holds (re-checked on every event from subscribe), false after ms.
function until(check, ms, subscribe = subscribeAgentHooks) {
  if (check()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), ms);
    const unsubscribe = subscribe(() => { if (check()) finish(true); });
    function finish(ok) { clearTimeout(timer); unsubscribe(); resolve(ok); }
  });
}

// Answers the `lirah` CLI. The Rust control server relays each request as an
// `agent-control` event {id, sessionId, cmd, args}; every one gets exactly one
// agent_control_reply. Mount once, inside the app's providers (it needs the
// tab and bookmark contexts).

// Loaded on first use: only QA instances ever need it, so it stays out of the startup bundle.
const qaDriver = () => import('./qaDriver');

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

const FAMILIES = { settings: 'list', theme: 'get', tabs: 'list', startup: 'get', tasks: 'list', plans: 'list', jobs: 'list', qa: 'snapshot' };

const flag = (v) => (v === undefined ? undefined : v === true || v === 'true' || v === 'on' || v === 1);

// `lirah settings set x 1` arrives as cmd "settings" with args._ ["set", "x", "1"];
// a dotted cmd ("settings.set") is taken as is. Returns [cmd, positionals].
function normalize(cmd, args) {
  const positional = Array.isArray(args?._) ? args._.map(String) : [];
  if (typeof cmd === 'string' && Object.hasOwn(FAMILIES, cmd)) {
    const [sub, ...rest] = positional;
    return [`${cmd}.${sub || FAMILIES[cmd]}`, rest];
  }
  return [cmd, positional];
}

export function useAgentControl() {
  const toast = useToast();
  const confirm = useConfirm();
  const theme = useTheme();
  const tabManager = useTabManager();
  const { bookmarks } = useBookmarks();
  const tasksActions = useTasksActions();
  const plansActions = usePlansActions();
  const jobsActions = useAgentJobsActions();
  // The listener is set up once; it reads the latest of these through the ref.
  const live = useRef({});
  live.current = { toast, confirm, theme, tabManager, bookmarks, tasks: tasksActions, plans: plansActions, jobs: jobsActions };

  useEffect(() => {
    // Ask before a guarded change. Resolves true when allowed.
    const allow = (plan) => {
      if (!plan.changed || !isGuarded(plan.key)) return Promise.resolve(true);
      const entry = settingsSchema[plan.key];
      const tabsNote = entry.appliesTo ? ' It applies to tabs opened after this.' : '';
      return live.current.confirm({
        title: `Let Claude set ${entry.label} to ${show(plan.value)}?`,
        description: `The agent in a tab asked to change ${plan.key} from ${show(plan.previous)} to ${show(plan.value)} through the lirah command.${tabsNote}`,
        confirmLabel: 'Allow',
      });
    };

    const apply = async (plan, verb) => {
      if (!plan.changed) return `${plan.key} is already ${show(plan.value)}`;
      if (!(await allow(plan))) throw new Error('denied by user');
      setSetting(plan.key, plan.value);
      live.current.toast.info(`Claude ${verb} ${plan.key} → ${show(plan.value)}`);
      const note = settingsSchema[plan.key].appliesTo ? ' (new tabs)' : '';
      return `${plan.key} = ${show(plan.value)}${note}`;
    };

    const name = (tab) => tabDisplayName(tab, live.current.bookmarks);
    const target = (tabs, ref, sessionId) => resolveTab(tabs, ref, { sessionId, bookmarks: live.current.bookmarks });
    // The caller's workspace (else the active one): its tabs, numbered as `lirah tabs`
    // lists them (the master terminal is not one of them), and its master.
    const scope = (sessionId) => {
      const { tabs, activeWorkspaceId } = live.current.tabManager;
      const ws = callerTab(tabs, sessionId)?.workspaceId || activeWorkspaceId;
      const own = tabs.filter((t) => t.workspaceId === ws && isProjectTab(t));
      return { tabs: own, master: masterTabOf(tabs, ws) };
    };
    // A worker tab of the caller's workspace, never the caller itself.
    const worker = (ref, sessionId) => {
      const tab = target(scope(sessionId).tabs, ref, sessionId);
      if (tab.id === callerTab(live.current.tabManager.tabs, sessionId)?.id) throw new Error("that's this tab; pick another one");
      return tab;
    };
    const stateOf = (tab) => getAgentHookState(getTabSession(tab.id))?.state || null;
    // Its turn since the last send has ended.
    const settled = (tab) => {
      const s = getAgentHookState(getTabSession(tab.id));
      return !!s && (s.state === 'done' || s.state === 'waiting') && s.at > (sentAt.get(tab.id) || 0);
    };
    // The reply to the last send. A program's own "done" (OSC 7501) can land
    // before its transcript has the reply, so a reply equal to the one from
    // before the send (or none yet, when there is a transcript) is re-read for up to 3 s.
    const freshReply = async (tab) => {
      const before = replyBefore.get(tab.id) ?? null;
      const hasTranscript = !!(getAgentTranscript(getTabSession(tab.id)) || getTabTranscript(tab.id));
      let reply = await lastReply(tab);
      for (let i = 0; i < 10 && reply === before && hasTranscript; i++) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        reply = await lastReply(tab);
      }
      return reply;
    };
    // A permission prompt is the user's call, not the master's.
    const refuseBlocked = (tab, args) => {
      if (stateOf(tab) === 'permission' && !flag(args.force)) {
        throw new Error(`${name(tab)} is waiting on a permission prompt; tell the user (--force types into it anyway)`);
      }
    };
    const lastReply = (tab) => {
      const path = getAgentTranscript(getTabSession(tab.id)) || getTabTranscript(tab.id);
      return path ? invoke('last_assistant_text', { transcriptPath: path }).catch(() => null) : null;
    };

    // `any` returns at the first finished worker, `all` once all have; both return
    // early when one is waiting on a permission prompt, so the user hears of it.
    const waitMany = async (mode, limit, sessionId) => {
      const pending = scope(sessionId).tabs.filter((t) => sentAt.has(t.id) && !collected.has(t.id));
      if (!pending.length) throw new Error('no worker has an unanswered prompt; send one with `lirah tabs send` first');
      await Promise.all(pending.map((t) => settleIfInterrupted(getTabSession(t.id))));
      const ready = () => pending.some((t) => stateOf(t) === 'permission')
        || (mode === 'all' ? pending.every(settled) : pending.some(settled));
      const done = await until(ready, limit);
      const { tabs } = scope(sessionId);
      const report = await Promise.all(pending.map(async (t) => {
        const finished = settled(t);
        if (finished) collected.add(t.id);
        return { index: tabs.indexOf(t) + 1, name: name(t), done: finished, state: stateOf(t), reply: finished ? await freshReply(t) : null };
      }));
      return { done, tabs: report };
    };

    const waitOutput = async (tab, text, limit) => {
      if (!text) throw new Error('--output needs the text to wait for');
      const session = getTabSession(tab.id);
      if (!session) throw new Error(`${name(tab)} has no terminal running`);
      const prev = outputWaits.get(tab.id);
      const resume = prev && prev.text === text && prev.session === session && Date.now() - prev.endedAt < 30_000;
      // Watched past the limit so a rerun within 30 s can resume.
      const start = watchOutput(session, limit + 60_000);
      const from = resume ? prev.from : start;
      const found = await until(() => outputSince(session, from).includes(text), limit, subscribeOutput);
      if (!found) {
        outputWaits.set(tab.id, { text, session, from, endedAt: Date.now() });
        return { done: false, output: text, state: stateOf(tab) };
      }
      outputWaits.delete(tab.id);
      const seen = outputSince(session, from);
      const at = seen.indexOf(text);
      const end = seen.indexOf('\n', at);
      return { done: true, state: 'printed', reply: seen.slice(seen.lastIndexOf('\n', at) + 1, end === -1 ? undefined : end).trim() };
    };

    const projectScope = async (sessionId) => {
      const tab = callerTab(live.current.tabManager.tabs, sessionId);
      if (!tab) throw new Error("can't tell which tab this is; pass --global for the global list");
      return resolveRepoRoot(tab.projectPath);
    };
    // Tasks are kept per workspace: the caller tab's workspace, or the global list.
    const workspaceScope = (sessionId) => {
      const tab = callerTab(live.current.tabManager.tabs, sessionId);
      if (!tab?.workspaceId) throw new Error("can't tell which tab this is; pass --global for the global list");
      return tab.workspaceId;
    };
    const taskScope = async (args, sessionId) => (args.global === true ? GLOBAL : workspaceScope(sessionId));
    const where = (scope) => (scope === GLOBAL ? 'the global list' : 'this workspace');
    // [scope, task] for an id from `lirah tasks`, in the list --global picks.
    const findTask = async (args, id, sessionId) => {
      if (!id) throw new Error('missing task id (see `lirah tasks`)');
      const scope = await taskScope(args, sessionId);
      const task = (await live.current.tasks.getTasks(scope)).find((t) => t.id === id);
      if (!task) throw new Error(`no task ${id} in ${where(scope)} (see \`lirah tasks${scope === GLOBAL ? ' --global' : ''}\`)`);
      return [scope, task];
    };

    // Plans: the caller tab's repo, as the plans pane shows it.
    const findPlan = (plans, ref) => {
      const text = String(ref ?? '').trim();
      if (!text) throw new Error('missing plan: give an index, an id or a title (see `lirah plans`)');
      const byIndex = /^\d+$/.test(text) ? plans[Number(text) - 1] : null;
      const plan = byIndex || plans.find((p) => p.id === text)
        || plans.find((p) => (p.title || '').toLowerCase() === text.toLowerCase());
      if (!plan) throw new Error(`no plan "${text}" (see \`lirah plans\`)`);
      return plan;
    };
    const findChunk = (plan, ref) => {
      const text = String(ref ?? '').trim();
      const chunk = plan.chunks.find((c) => c.id === text || String(c.n) === text);
      if (!chunk) throw new Error(`no chunk "${text}" in ${plan.title || plan.id} (see \`lirah plans show\`)`);
      return chunk;
    };
    const planSummary = (plan, index) => {
      const { done, total } = planProgress(plan);
      return {
        index, id: plan.id, title: plan.title || '(untitled)', done, total,
        split: plan.split, autopilot: plan.autopilot?.status || 'off', file: plan.importedFrom?.path || null,
        stage: planStage(plan), pr: plan.pr ?? null, merged: plan.merged ?? null,
      };
    };

    // Jobs: the caller tab's repo (or every repo with --all), archived ones left out, newest first.
    const jobScope = async (args, sessionId) => {
      const all = live.current.jobs.getJobs().filter((j) => !j.archived);
      if (args.all === true) return { repo: null, jobs: all };
      const repo = await projectScope(sessionId);
      return { repo, jobs: all.filter((j) => j.repoPath === repo) };
    };
    // [index, job] for an index from `lirah jobs` or a job id, in the same scope.
    const findJob = (args, jobs, ref) => {
      const text = String(ref ?? '').trim();
      const see = `see \`lirah jobs${args.all === true ? ' --all' : ''}\``;
      if (!text) throw new Error(`missing job: give an index or an id (${see})`);
      const i = /^\d+$/.test(text) ? Number(text) - 1 : jobs.findIndex((j) => j.id === text);
      if (!jobs[i]) throw new Error(`no job "${text}" (${see})`);
      return [i + 1, jobs[i]];
    };
    const jobSummary = (j, index) => ({
      index, id: j.id, status: j.status, cli: j.cli, label: j.label,
      repo: j.repoPath, startedAt: j.startedAt, endedAt: j.endedAt,
      files: j.changedFiles?.length ?? 0, report: j.reportPath || null,
      log: j.logPath || null, race: !!j.raceId,
    });
    // Other jobs touching this job's files, as "jobs 3, 5" indexes (or ids when out of scope).
    const jobOverlaps = (job, jobs) => {
      const rel = (job.changedFiles || []).map((f) => relToRepo(job, f.path));
      return live.current.jobs.findOverlappingJobs(job.repoPath, rel)
        .filter((o) => o.id !== job.id)
        .map((o) => {
          const i = jobs.findIndex((j) => j.id === o.id);
          return { ...o, index: i === -1 ? null : i + 1 };
        });
    };
    const overlapNote = (overlaps) => {
      if (!overlaps.length) return '';
      const refs = overlaps.map((o) => o.index ?? o.id);
      return `job${refs.length === 1 ? '' : 's'} ${refs.join(', ')} also touch${refs.length === 1 ? 'es' : ''} these files; applying ${refs.length === 1 ? 'it' : 'them'} later may conflict`;
    };
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // What diagnosePlan needs from the app for `plan`.
    const debugEnv = async (plan) => {
      const cfg = planGit(plan);
      const paths = (cfg.worktrees ? cfg.repos || [] : []).map((r) => r.workPath).filter(Boolean);
      const exists = await Promise.all(paths.map((path) => invoke('path_exists', { path }).catch(() => true)));
      let fileHash;
      if (plan.importedFrom?.path) {
        const there = await invoke('path_exists', { path: plan.importedFrom.path }).catch(() => true);
        fileHash = there ? await invoke('read_file_content', { path: plan.importedFrom.path }).then(hash8).catch(() => undefined) : null;
      }
      return {
        tabIds: new Set(live.current.tabManager.tabs.map((t) => t.id)),
        agentState: (tabId) => getAgentHookState(getTabSession(tabId))?.state ?? null,
        missingPaths: new Set(paths.filter((_, i) => !exists[i])),
        fileHash,
      };
    };

    // Apply one finding's fix; returns what happened, for the reply.
    const applyFix = async (repo, plan, f) => {
      const { runSplit, checkChunk, updateChunk, replaceSource } = live.current.plans;
      const chunk = plan.chunks.find((c) => c.n === f.chunk);
      switch (f.fix) {
        case DEBUG_FIX.RESPLIT:
          runSplit(repo, plan.id); // runs in the background; debug again to see the result
          return 'splitting again';
        case DEBUG_FIX.RECHECK:
        case DEBUG_FIX.RESET: {
          const res = await checkChunk(repo, plan.id, chunk.id);
          if (res.error) return `chunk ${chunk.n}: commit check failed: ${res.error}`;
          if (res.found) return `chunk ${chunk.n}: found ${res.commits.length} commit(s), now implemented`;
          if (f.fix === DEBUG_FIX.RECHECK) return `chunk ${chunk.n}: no commits yet`;
          updateChunk(repo, plan.id, chunk.id, PENDING_PATCH);
          return `chunk ${chunk.n}: no commits; back to pending`;
        }
        case DEBUG_FIX.REIMPORT: {
          const path = plan.importedFrom.path;
          const source = await invoke('read_file_content', { path });
          replaceSource(repo, plan.id, { source, importedFrom: { path, hash: hash8(source) } });
          return 're-imported the edited plan file; splitting again';
        }
        default:
          return null;
      }
    };

    const handlers = {
      // QA driver (`lirah qa ...`); the control server only lets these through when the app runs with LIRAH_QA=1.
      'qa.snapshot': async (args, [scope = args.scope]) => (await qaDriver()).snapshot(scope),
      'qa.click': async (args, [ref = args.ref]) => (await qaDriver()).click(ref),
      'qa.type': async (args, [ref = args.ref, ...words]) => (await qaDriver()).type(ref, args.text ?? words.join(' ')),
      'qa.key': async (args, [combo = args.key]) => (await qaDriver()).key(combo),
      'qa.text': async (args, [what = args.target]) => (await qaDriver()).text(what),
      'qa.wait': async (args, words) => (await qaDriver()).wait(args.text ?? words.join(' '), { timeout: Math.min(Number(args.timeout) || 10, 50), gone: !!args.gone }),
      'qa.terminal': async (args, [n = args.n ?? 1]) => (await qaDriver()).terminal(n, args.rows ?? 40),
      'qa.terminal-type': async (args, [n = 1, ...words]) => (await qaDriver()).terminalType(n, (args.text ?? words.join(' ')) + (args.enter ? '\r' : '')),
      'settings.list': () => listSettings(),
      'settings.get': (args, [key = args.key]) => getSetting(key),
      'settings.set': (args, [key = args.key, value = args.value]) => apply(prepareSetting(key, value), 'set'),
      'settings.reset': (args, [key = args.key]) => apply(prepareReset(key), 'reset'),
      'theme.list': () => {
        const { themes, currentTheme } = live.current.theme;
        return listThemes(themes, currentTheme);
      },
      'theme.get': () => live.current.theme.currentTheme,
      'theme.set': (args, [name = args.name]) => {
        const { themes, currentTheme, changeTheme } = live.current.theme;
        const id = resolveTheme(themes, name);
        if (id === currentTheme) return `theme is already ${id}`;
        changeTheme(id);
        live.current.toast.info(`Claude set theme → ${themes[id].name}`);
        return `theme = ${id}`;
      },

      // Tabs. <tab> is ".", a 1-based index, an id or a name (see resolveTab).
      'tabs.list': (args, positional, { sessionId }) => {
        const { tabs } = scope(sessionId);
        return listTabs(tabs, live.current.tabManager.activeTabId, live.current.bookmarks, callerTab(tabs, sessionId)?.id);
      },
      'tabs.master': (args, positional, { sessionId }) => {
        const { master } = scope(sessionId);
        if (!master) return 'no workspace terminal is open yet (the crown in the Workspace pane opens it)';
        return master.id === callerTab(live.current.tabManager.tabs, sessionId)?.id
          ? 'you are the workspace terminal: the tabs in `lirah tabs` are your workers'
          : 'you are a worker tab; the workspace terminal is open';
      },
      'tabs.note': (args, [ref = args.tab, ...words], { sessionId }) => {
        const tab = target(scope(sessionId).tabs, ref, sessionId);
        const note = (words.length ? words.join(' ') : String(args.note ?? '')).trim();
        live.current.tabManager.setTabNote(tab.id, note);
        return note ? `${name(tab)}: ${note}` : `cleared the note of ${name(tab)}`;
      },
      'tabs.show': async (args, [ref = args.tab], { sessionId }) => {
        const { tabs } = scope(sessionId);
        const tab = target(tabs, ref, sessionId);
        const branch = await invoke('get_current_branch', { repoPath: tab.projectPath }).catch(() => null);
        const reply = await lastReply(tab);
        return {
          index: tabs.indexOf(tab) + 1, name: name(tab), path: tab.projectPath, note: tab.note || null,
          role: tab.role || null, branch,
          agent: getAgentHookState(getTabSession(tab.id))?.state || null,
          lastReply: reply && reply.length > 400 ? `${reply.slice(0, 400)}…` : reply,
        };
      },
      // Pastes a prompt into a worker tab's agent without switching to it; a
      // tab never shown boots in the background first.
      'tabs.send': async (args, [ref = args.tab, ...words], { sessionId }) => {
        const tab = worker(ref, sessionId);
        const text = (words.length ? words.join(' ') : String(args.prompt ?? '')).trim();
        if (!text) throw new Error('missing prompt');
        const agentUp = () => getTabPrompt(tab.id) && getAgentHookState(getTabSession(tab.id));
        if (!agentUp()) {
          if (getTabSession(tab.id) && !tab.background) {
            throw new Error(`${name(tab)} has no agent running; start one there first`);
          }
          live.current.tabManager.wakeTab(tab.id);
          const until = Date.now() + 45_000;
          while (!agentUp()) {
            if (Date.now() > until) throw new Error(`${name(tab)}'s agent didn't start in 45 s`);
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        refuseBlocked(tab, args);
        replyBefore.set(tab.id, await lastReply(tab));
        const at = Date.now();
        sentAt.set(tab.id, at);
        collected.delete(tab.id);
        await getTabPrompt(tab.id).send(text);
        const n = scope(sessionId).tabs.indexOf(tab) + 1;
        // Any state change after the send means it arrived.
        const arrived = await until(() => (getAgentHookState(getTabSession(tab.id))?.at || 0) > at, 8000);
        return arrived
          ? `sent to ${name(tab)}; \`lirah tabs wait ${n}\` for its reply`
          : `sent to ${name(tab)}, but it shows no sign of starting yet; check \`lirah tabs show ${n}\` before sending again`;
      },
      // Waits for the worker's turn (since the last send) to end, then gives its
      // last reply. Under the app's 60 s limit; the caller loops on "working".
      // The screen as text; --lines N adds that many lines of history above it.
      'tabs.read': (args, [ref = args.tab], { sessionId }) => {
        const tab = worker(ref, sessionId);
        const term = getSessionTerminal(getTabSession(tab.id));
        if (!term) throw new Error(`${name(tab)} has no terminal running`);
        const buf = term.buffer.active;
        const history = Math.max(0, Math.floor(Number(args.lines) || 0));
        const lines = [];
        for (let i = Math.max(0, buf.baseY - history); i < buf.baseY + term.rows; i++) {
          lines.push(buf.getLine(i)?.translateToString(true) ?? '');
        }
        while (lines.length && !lines.at(-1).trim()) lines.pop();
        return lines.join('\n') || `(${name(tab)}'s screen is empty)`;
      },
      // Named keys (enter, esc, down, ctrl+c, y), one at a time, for dialogs the agent can't get past.
      'tabs.keys': async (args, [ref = args.tab, ...names], { sessionId }) => {
        const tab = worker(ref, sessionId);
        if (!names.length) throw new Error('missing keys, e.g. `lirah tabs keys 2 down enter`');
        refuseBlocked(tab, args);
        const session = getTabSession(tab.id);
        if (!session) throw new Error(`${name(tab)} has no terminal running`);
        const appCursor = !!getSessionTerminal(session)?.modes.applicationCursorKeysMode;
        const data = names.map((k) => keyBytes(k, { appCursor })); // all checked before any is sent
        for (const [i, bytes] of data.entries()) {
          // A gap, or a TUI reads esc followed by a key as one alt+key.
          if (i) await new Promise((resolve) => setTimeout(resolve, 60));
          await invoke('write_to_terminal', { sessionId: session, data: bytes });
        }
        return `pressed ${names.join(' ')} in ${name(tab)}`;
      },
      // Stops the agent's current turn (esc, as in Claude Code and opencode); the tab stays open.
      'tabs.interrupt': async (args, [ref = args.tab], { sessionId }) => {
        const tab = worker(ref, sessionId);
        refuseBlocked(tab, args);
        if (stateOf(tab) !== 'working' && !flag(args.force)) return `${name(tab)} isn't working; nothing to stop`;
        const session = getTabSession(tab.id);
        await invoke('write_to_terminal', { sessionId: session, data: '\x1b' });
        // The interrupt reaches the transcript a moment later.
        for (let i = 0; i < 8; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (stateOf(tab) !== 'working' || (await settleIfInterrupted(session))) return `stopped ${name(tab)}'s turn`;
        }
        return `sent esc to ${name(tab)}, but it still looks busy; \`lirah tabs read\` it to check`;
      },
      // --output waits for text instead; --any|--all wait on every worker with an unanswered send.
      'tabs.wait': async (args, [ref = args.tab], { sessionId }) => {
        const limit = Math.min(Number(args.timeout) || 50, 55) * 1000;
        if (flag(args.any) || flag(args.all)) return waitMany(flag(args.all) ? 'all' : 'any', limit, sessionId);
        const tab = worker(ref, sessionId);
        if (args.output !== undefined) return waitOutput(tab, String(args.output), limit);
        await settleIfInterrupted(getTabSession(tab.id));
        const ok = await until(() => settled(tab), limit);
        if (!ok) return { done: false, state: stateOf(tab) };
        collected.add(tab.id);
        return { done: true, state: stateOf(tab), reply: await freshReply(tab) };
      },
      'tabs.open': async (args, [path = args.path], { sessionId }) => {
        const dir = await resolveTabPath(path);
        const launch = args.launch === true || args.launch === 'true';
        // A tab the master opens for a worker stays in the background.
        const fromMaster = !!callerTab(live.current.tabManager.tabs, sessionId)?.master;
        const tab = live.current.tabManager.addTab(dir, { launch, focus: !fromMaster });
        live.current.toast.info(`Claude opened a tab in ${tab.label}${launch ? ' and is starting its agent' : ''}`);
        return `opened ${tab.label} (${tab.id})${launch ? ', launching its agent' : ''}`;
      },
      'tabs.close': async (args, [ref = args.tab], { sessionId, later }) => {
        const { tabs, confirmCloseTab, removeTab } = live.current.tabManager;
        const tab = target(scope(sessionId).tabs, ref, sessionId);
        if (tabs.length < 2) throw new Error("can't close the last tab");
        if (!(await confirmCloseTab(tab.id))) throw new Error('denied by user');
        // Close after replying: closing the caller's own tab ends the CLI waiting on it.
        later(() => removeTab(tab.id));
        return `closing ${name(tab)}`;
      },
      'tabs.rename': (args, [ref = args.tab, ...words], { sessionId }) => {
        const { tabs, renameTab } = live.current.tabManager;
        const tab = target(scope(sessionId).tabs, ref, sessionId);
        const label = (words.length ? words.join(' ') : String(args.name ?? '')).trim();
        renameTab(tab.id, label);
        return label ? `renamed ${tab.label} → ${label}` : `${tab.label} is back to its automatic name`;
      },
      'tabs.focus': (args, [ref = args.tab], { sessionId }) => {
        const { tabs, switchTab } = live.current.tabManager;
        const tab = target(scope(sessionId).tabs, ref, sessionId);
        switchTab(tab.id);
        return `focused ${name(tab)}`;
      },

      // Startup: what opens at launch. startupProjects is only edited here,
      // never through settings.set.
      'startup.get': () => getStartup(),
      'startup.mode': (args, [mode = args.mode]) => {
        if (mode === undefined) return getStartup().mode;
        const plan = setStartupMode(mode);
        if (!plan.changed) return `startup mode is already ${plan.mode}`;
        live.current.toast.info(`Claude set startup → ${plan.mode === 'projects' ? 'open startup projects' : 'restore last tabs'}`);
        const { projects } = getStartup();
        const note = plan.mode === 'projects' && projects.length === 0
          ? ' (no startup projects yet, so the last tabs still restore; add some with `lirah startup add`)'
          : '';
        return `startup mode = ${plan.mode}${note}`;
      },
      'startup.add': async (args, [path = args.path]) => {
        const { entry, added } = await addStartupProject(path, { launch: flag(args.launch), name: args.name });
        const what = `${entry.path}${entry.name ? ` as "${entry.name}"` : ''}${entry.launch ? ', launching its agent' : ''}`;
        live.current.toast.info(`Claude ${added ? 'added' : 'updated'} startup project ${entry.name || entry.path}`);
        const note = getStartup().mode === 'projects' ? '' : ' (startup mode is restore; `lirah startup mode projects` to use it)';
        return `${added ? 'added' : 'updated'} ${what}${note}`;
      },
      'startup.remove': async (args, [path = args.path]) => {
        const { removed } = await removeStartupProject(path);
        if (!removed) throw new Error(`not a startup project: ${path} (see \`lirah startup\`)`);
        live.current.toast.info(`Claude removed startup project ${removed.name || removed.path}`);
        return `removed ${removed.path}`;
      },
      'startup.clear': () => {
        const count = clearStartupProjects();
        if (!count) return 'no startup projects to clear';
        live.current.toast.info('Claude cleared the startup projects');
        return `cleared ${count} startup project${count === 1 ? '' : 's'}`;
      },

      // Tasks: the caller tab's project list (as the tasks pane scopes it), or --global.
      'plans.list': async (args, positional, { sessionId }) => {
        const repo = await projectScope(sessionId);
        const plans = await live.current.plans.getPlans(repo);
        return { repo, plans: plans.map((p, i) => planSummary(p, i + 1)) };
      },
      'plans.show': async (args, [ref = args.plan], { sessionId }) => {
        const repo = await projectScope(sessionId);
        const plans = await live.current.plans.getPlans(repo);
        const plan = findPlan(plans, ref);
        return {
          ...planSummary(plan, plans.indexOf(plan) + 1),
          summary: plan.summary || '',
          chunks: plan.chunks.map((c) => ({ n: c.n, id: c.id, state: effectiveChunkState(c), title: c.title || '' })),
        };
      },
      // A *_plan.md file → a plan, split into chunks; as the pane's import offer.
      'plans.import': async (args, [path = args.path], { sessionId }) => {
        const repo = await projectScope(sessionId);
        const source = await invoke('read_file_content', { path });
        if (!source.trim()) throw new Error(`${path} is empty`);
        const importedFrom = { path, hash: hash8(source) };
        const { getPlans, createPlan, replaceSource } = live.current.plans;
        const existing = (await getPlans(repo)).find((p) => p.importedFrom?.path === path);
        if (existing?.importedFrom.hash === importedFrom.hash) return `already imported as ${existing.id}`;
        let id;
        if (existing) {
          replaceSource(repo, existing.id, { source, importedFrom }); // keeps the chunks already done
          id = existing.id;
        } else {
          id = await createPlan(repo, { source, importedFrom, workspaceId: callerTab(live.current.tabManager.tabs, sessionId)?.workspaceId });
        }
        live.current.toast.info(`Claude imported plan ${path.split('/').pop()}`);
        return `${existing && id === existing.id ? 'updated' : 'imported'} ${id}; splitting into chunks (see \`lirah plans show ${id}\`)`;
      },
      // The plan's file and what to change in it, for the calling agent to edit; then plans.rechunk.
      'plans.revise': async (args, [ref = args.plan, ...words], { sessionId }) => {
        const repo = await projectScope(sessionId);
        const plan = findPlan(await live.current.plans.getPlans(repo), ref);
        const notes = words.join(' ').trim() || String(args.notes ?? '').trim();
        if (!notes) throw new Error('say what should change: lirah plans revise <plan> <notes>');
        const path = await live.current.plans.ensurePlanFile(repo, plan.id);
        return `${buildPlanRevisePrompt(plan, notes, path)}\n\nWhen the file is updated, run \`lirah plans rechunk ${plan.id}\`.`;
      },
      // As the pane's re-chunk: the plan's file as it is now, the chunks already done kept.
      'plans.rechunk': async (args, [ref = args.plan], { sessionId }) => {
        const repo = await projectScope(sessionId);
        const plan = findPlan(await live.current.plans.getPlans(repo), ref);
        await live.current.plans.rechunk(repo, plan.id);
        live.current.toast.info(`Claude re-chunked ${plan.title || 'a plan'}`);
        return `re-chunking ${plan.id} (see \`lirah plans show ${plan.id}\`)`;
      },
      // As the pane's "mark done": commits since the chunk started win, else it's done with nothing to commit.
      'plans.done': async (args, [planRef = args.plan, chunkRef = args.chunk], { sessionId }) => {
        const repo = await projectScope(sessionId);
        const plan = findPlan(await live.current.plans.getPlans(repo), planRef);
        const chunk = findChunk(plan, chunkRef);
        if (chunk.status === CHUNK_STATUS.IMPLEMENTED) return `chunk ${chunk.n} is already implemented`;
        if (chunk.status !== CHUNK_STATUS.IN_PROGRESS) {
          throw new Error(`chunk ${chunk.n} is ${chunk.status}; only a chunk in progress (sent from the plans pane) can be marked done`);
        }
        const result = args.result === undefined ? null : String(args.result);
        const res = await live.current.plans.markChunkDone(repo, plan.id, chunk.id, result);
        if (res.error) throw new Error(`couldn't check the chunk's commits: ${res.error}`);
        live.current.toast.info(`Claude marked chunk ${chunk.n} of ${plan.title || 'a plan'} done`);
        return res.found ? `chunk ${chunk.n} implemented (${res.commits.length} commit${res.commits.length === 1 ? '' : 's'})` : `chunk ${chunk.n} done with nothing to commit`;
      },

      // Stuck or broken states of a plan; --fix applies the safe repairs, then checks again.
      'plans.debug': async (args, [ref = args.plan], { sessionId }) => {
        const repo = await projectScope(sessionId);
        const { getPlans } = live.current.plans;
        let plan = findPlan(await getPlans(repo), ref);
        const found = diagnosePlan(plan, await debugEnv(plan));
        const applied = [];
        if (args.fix === true) {
          for (const f of found.filter((x) => x.fix)) {
            try {
              const what = await applyFix(repo, plan, f);
              if (what) {
                applied.push(what);
                live.current.toast.info(`Claude fixed ${plan.title || 'a plan'}: ${what}`);
              }
            } catch (e) {
              applied.push(`${f.code}: fix failed: ${e?.message || e}`);
            }
            plan = (await getPlans(repo)).find((p) => p.id === plan.id) || plan;
          }
        }
        const remaining = args.fix === true ? diagnosePlan(plan, await debugEnv(plan)) : found;
        const { source, ...state } = plan;
        return {
          id: plan.id, title: plan.title || '(untitled)', found, applied, remaining,
          state: { ...state, sourceLength: source?.length ?? 0 },
        };
      },

      // Jobs: background agent jobs, as the jobs pane shows them. Rerunning,
      // revising, archiving and races stay in the pane.
      'jobs.list': async (args, positional, { sessionId }) => {
        const { repo, jobs } = await jobScope(args, sessionId);
        return { repo, jobs: jobs.map((j, i) => jobSummary(j, i + 1)) };
      },
      // As the Run job dialog with one agent, always in an isolated worktree; asks the user first.
      'jobs.run': async (args, words, { sessionId }) => {
        const prompt = (words.length ? words.join(' ') : String(args.prompt ?? '')).trim();
        if (!prompt) throw new Error('missing prompt: lirah jobs run <prompt> [--cli C] [--label L]');
        const cli = args.cli === undefined ? 'claude' : String(args.cli);
        const known = JOB_CLIS.find((o) => o.value === cli);
        if (!known) throw new Error(`unknown cli "${cli}" (${JOB_CLIS.map((o) => o.value).join(', ')})`);
        if (!(await invoke('check_command_exists', { command: known.bin }).catch(() => true))) {
          throw new Error(`${known.bin} is not installed`);
        }
        const repo = await projectScope(sessionId);
        const oneLine = prompt.replace(/\s+/g, ' ');
        const label = args.label === undefined ? (oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine) : String(args.label);
        const ok = await live.current.confirm({
          title: `Let Claude start a background ${known.label} job?`,
          description: `"${oneLine.length > 300 ? `${oneLine.slice(0, 297)}...` : oneLine}" in ${repo}. It runs unattended with auto-approve, in an isolated worktree, so nothing lands in your tree until it's applied (outside a git repo, or if the worktree can't be made, it runs in place).`,
          confirmLabel: 'Start job',
        });
        if (!ok) throw new Error('denied by user');
        const id = await live.current.jobs.launchJob({
          cli, prompt, label, repoPath: repo, useWorktree: true,
          workspaceId: callerTab(live.current.tabManager.tabs, sessionId)?.workspaceId,
        });
        live.current.toast.info(`Claude started job "${label}"`);
        return `started job ${id} (${cli}) in ${repo}; follow it with \`lirah jobs show ${id}\``;
      },
      'jobs.show': async (args, [ref = args.job], { sessionId }) => {
        const { jobs } = await jobScope(args, sessionId);
        const [index, job] = findJob(args, jobs, ref);
        return {
          ...jobSummary(job, index),
          prompt: job.prompt, cwd: job.cwd, worktree: job.worktreePath || null, exitCode: job.exitCode ?? null,
          error: job.error || null, diffStat: job.diffStat || null, typecheck: job.typecheck || null,
          idleSecs: job.idleSecs ?? null, kind: job.kind || null,
          changedFiles: (job.changedFiles || []).map((f) => relToRepo(job, f.path)),
          overlaps: jobOverlaps(job, jobs),
        };
      },
      'jobs.cancel': async (args, [ref = args.job], { sessionId }) => {
        const { jobs } = await jobScope(args, sessionId);
        const [index, job] = findJob(args, jobs, ref);
        if (job.status !== 'running') throw new Error(`job ${index} is ${job.status}, not running`);
        if (job.raceId) throw new Error(`job ${index} is a race candidate; cancel it in the jobs pane`);
        await live.current.jobs.cancelJob(job.id);
        live.current.toast.info(`Claude cancelled "${job.label}"`);
        const kept = job.worktreePath
          ? 'worktree kept (discard it in the jobs pane)'
          : 'it ran in place, so its partial edits are already in the repo';
        return `cancelled ${index}; ${kept}${job.logPath ? `; output so far: ${job.logPath}` : ''}`;
      },
      // As the pane's Apply button (approveJob: typecheck gate, dirty-tree prompt), after asking the user.
      'jobs.apply': async (args, [ref = args.job], { sessionId }) => {
        const { jobs } = await jobScope(args, sessionId);
        const [index, job] = findJob(args, jobs, ref);
        const n = job.changedFiles?.length ?? 0;
        if (job.status === 'running') throw new Error(`job ${index} is running; wait for it to finish`);
        if (job.status === 'applied') throw new Error(`job ${index} is already applied`);
        if (!['done', 'failed', 'conflict', 'interrupted'].includes(job.status)) throw new Error(`job ${index} is ${job.status}; nothing to apply`);
        if (!job.worktreePath) throw new Error(`job ${index} ran in place, its changes are already in the repo`);
        if (!n) throw new Error(`job ${index} has no changes to apply`);
        if (job.raceId) throw new Error(`job ${index} is a race candidate; pick the winner in the jobs pane`);
        const force = args.force === true;
        const note = overlapNote(jobOverlaps(job, jobs));
        const ok = await live.current.confirm({
          title: `Let Claude apply "${job.label}"?`,
          description: [
            `The agent in a tab asked to apply ${plural(n, 'changed file')} into ${job.repoPath} as uncommitted changes.`,
            force && 'Typecheck skipped (--force).',
            note && `${note[0].toUpperCase()}${note.slice(1)}.`,
          ].filter(Boolean).join(' '),
          confirmLabel: 'Apply',
        });
        if (!ok) throw new Error('denied by user');
        const res = await live.current.jobs.approveJob(job.id, { force });
        if (res.blocked) throw new Error(`not applied: ${plural(res.typecheck?.errorCount ?? 0, 'type error')} in the changes; fix them, or apply --force`);
        if (res.cancelled) throw new Error('denied by user');
        if (!res.ok) throw new Error(`apply failed: ${res.error} (a patch that doesn't apply cleanly writes nothing; the job and its worktree are kept)`);
        live.current.toast.info(`Claude applied "${job.label}" (${plural(n, 'file')})`);
        return `applied ${plural(n, 'file')} into ${job.repoPath} (uncommitted)${note ? `; ${note}` : ''}`;
      },

      'tasks.list': async (args, positional, { sessionId }) => {
        const scope = await taskScope(args, sessionId);
        const tasks = await live.current.tasks.getTasks(scope);
        return {
          scope: scope === GLOBAL ? 'global' : 'workspace',
          tasks: tasks.map(({ id, title, notes, status }) => ({ id, title, notes, status })),
        };
      },
      'tasks.add': async (args, words, { sessionId }) => {
        const fields = splitTaskText(words.length ? words.join(' ') : String(args.title ?? ''));
        if (args.notes !== undefined) fields.notes = [fields.notes, String(args.notes)].filter(Boolean).join('\n\n');
        if (!fields.title) throw new Error('missing title: lirah tasks add <title> [--notes N] [--global]');
        const scope = await taskScope(args, sessionId);
        if (scope !== GLOBAL) fields.repos = [await projectScope(sessionId)];
        const id = await live.current.tasks.addTask(scope, fields);
        live.current.toast.info(`Claude added task "${fields.title}"`);
        return `added task ${id} to ${where(scope)}`;
      },
      'tasks.done': async (args, [id = args.id], { sessionId }) => {
        const [scope, task] = await findTask(args, id, sessionId);
        if (task.status === TASK_STATUS.DONE) return `${id} is already done`;
        live.current.tasks.updateTask(scope, id, { status: TASK_STATUS.DONE });
        live.current.toast.info(`Claude marked "${task.title}" done`);
        return `${id} done`;
      },
      'tasks.reopen': async (args, [id = args.id], { sessionId }) => {
        const [scope, task] = await findTask(args, id, sessionId);
        if (task.status !== TASK_STATUS.DONE) return `${id} is not done (${task.status})`;
        // As the pane's done toggle: back to planned if it had a plan.
        const status = task.planPath ? TASK_STATUS.PLANNED : TASK_STATUS.BACKLOG;
        live.current.tasks.updateTask(scope, id, { status });
        live.current.toast.info(`Claude reopened "${task.title}"`);
        return `${id} ${status}`;
      },
      'tasks.edit': async (args, [id = args.id], { sessionId }) => {
        const [scope, task] = await findTask(args, id, sessionId);
        const patch = {};
        if (args.title !== undefined) patch.title = String(args.title).trim();
        if (args.notes !== undefined) patch.notes = String(args.notes).trim();
        if (!Object.keys(patch).length) throw new Error('nothing to change: lirah tasks edit <id> [--title T] [--notes N]');
        if (patch.title === '') throw new Error("a task's title can't be empty");
        live.current.tasks.updateTask(scope, id, patch);
        live.current.toast.info(`Claude edited "${patch.title || task.title}"`);
        return `edited ${id}`;
      },
      'tasks.remove': async (args, [id = args.id], { sessionId }) => {
        const [scope, task] = await findTask(args, id, sessionId);
        const { removeTask, restoreTask } = live.current.tasks;
        const removed = removeTask(scope, id);
        if (!removed) throw new Error(`no task ${id}`);
        live.current.toast.info(`Claude deleted "${task.title}"`, {
          duration: 8000,
          action: { label: 'undo', onClick: () => restoreTask(scope, removed.task, removed.index) },
        });
        return `removed ${id}`;
      },
      // Between this tab's project list and the global list; --global moves from global.
      'tasks.move': async (args, [id = args.id], { sessionId }) => {
        const [from, task] = await findTask(args, id, sessionId);
        const to = from === GLOBAL ? workspaceScope(sessionId) : GLOBAL;
        await live.current.tasks.moveToScope(from, to, id);
        live.current.toast.info(`Claude moved "${task.title}" to ${to === GLOBAL ? 'global tasks' : 'this workspace'}`);
        return `moved ${id} to ${where(to)}`;
      },
    };

    const reply = (id, ok, data, error) => invoke('agent_control_reply', { id, ok, data, error })
      .catch((e) => console.warn('agent_control_reply failed:', e));

    const handle = async ({ id, sessionId, cmd, args }) => {
      // Work a handler defers until its reply has gone out.
      const deferred = [];
      const later = (fn) => deferred.push(fn);
      try {
        if (!getSettings().agentControl) {
          throw new Error('agent control is off in Lirah\'s settings (Agent → Agent control)');
        }
        const [name, positional] = normalize(cmd, args);
        const handler = handlers[name];
        if (!handler) {
          throw new Error(`unknown command "${name}"; known: ${Object.keys(handlers).join(', ')}`);
        }
        const data = await handler(args && typeof args === 'object' ? args : {}, positional, { sessionId, later });
        await reply(id, true, data ?? null, null);
      } catch (e) {
        deferred.length = 0;
        await reply(id, false, null, e?.message || String(e));
      }
      for (const fn of deferred) fn();
    };

    let unlisten;
    let disposed = false;
    listen('agent-control', (event) => { handle(event.payload ?? {}); })
      .then((fn) => { if (disposed) fn(); else unlisten = fn; })
      .catch((e) => console.warn('Failed to listen for agent-control:', e));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
