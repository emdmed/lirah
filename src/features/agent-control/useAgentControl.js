import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../toast';
import { useConfirm } from '../dialogs/DialogProvider';
import { useTheme } from '../../contexts/ThemeContext';
import { getSettings, setSetting } from '../settings/settingsStore';
import { MAX_TABS, tabDisplayName, useTabManager } from '../tabs/TabContext';
import { useBookmarks } from '../bookmarks';
import { useTasksActions } from '../tasks/TasksContext';
import { GLOBAL, splitTaskText, TASK_STATUS } from '../tasks/taskModel';
import { resolveRepoRoot } from '../plans/planRepoRoot';
import {
  addStartupProject, callerTab, clearStartupProjects, getSetting, getStartup, removeStartupProject, setStartupMode, isGuarded, listSettings, listTabs, listThemes, prepareReset, prepareSetting,
  resolveTab, resolveTabPath, resolveTheme, settingsSchema,
} from './actions';

// Answers the `lirah` CLI. The Rust control server relays each request as an
// `agent-control` event {id, sessionId, cmd, args}; every one gets exactly one
// agent_control_reply. Mount once, inside the app's providers (it needs the
// tab and bookmark contexts).

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

const FAMILIES = { settings: 'list', theme: 'get', tabs: 'list', startup: 'get', tasks: 'list' };

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
  // The listener is set up once; it reads the latest of these through the ref.
  const live = useRef({});
  live.current = { toast, confirm, theme, tabManager, bookmarks, tasks: tasksActions };

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

    const projectScope = async (sessionId) => {
      const tab = callerTab(live.current.tabManager.tabs, sessionId);
      if (!tab) throw new Error("can't tell which tab this is; pass --global for the global list");
      return (await resolveRepoRoot(tab.projectPath).catch(() => null)) || tab.projectPath;
    };
    const taskScope = (args, sessionId) => (args.global === true ? GLOBAL : projectScope(sessionId));
    const where = (scope) => (scope === GLOBAL ? 'the global list' : scope);
    // [scope, task] for an id from `lirah tasks`, in the list --global picks.
    const findTask = async (args, id, sessionId) => {
      if (!id) throw new Error('missing task id (see `lirah tasks`)');
      const scope = await taskScope(args, sessionId);
      const task = (await live.current.tasks.getTasks(scope)).find((t) => t.id === id);
      if (!task) throw new Error(`no task ${id} in ${where(scope)} (see \`lirah tasks${scope === GLOBAL ? ' --global' : ''}\`)`);
      return [scope, task];
    };

    const handlers = {
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
        const { tabs, activeTabId } = live.current.tabManager;
        return listTabs(tabs, activeTabId, live.current.bookmarks, callerTab(tabs, sessionId)?.id);
      },
      'tabs.open': async (args, [path = args.path]) => {
        const dir = await resolveTabPath(path);
        const launch = args.launch === true || args.launch === 'true';
        const tab = live.current.tabManager.addTab(dir, { launch });
        if (!tab) throw new Error(`tab limit reached (${MAX_TABS}); close a tab first`);
        live.current.toast.info(`Claude opened a tab in ${tab.label}${launch ? ' and is starting its agent' : ''}`);
        return `opened ${tab.label} (${tab.id})${launch ? ', launching its agent' : ''}`;
      },
      'tabs.close': async (args, [ref = args.tab], { sessionId, later }) => {
        const { tabs, confirmCloseTab, removeTab } = live.current.tabManager;
        const tab = target(tabs, ref, sessionId);
        if (tabs.length < 2) throw new Error("can't close the last tab");
        if (!(await confirmCloseTab(tab.id))) throw new Error('denied by user');
        // Close after replying: closing the caller's own tab ends the CLI waiting on it.
        later(() => removeTab(tab.id));
        return `closing ${name(tab)}`;
      },
      'tabs.rename': (args, [ref = args.tab, ...words], { sessionId }) => {
        const { tabs, renameTab } = live.current.tabManager;
        const tab = target(tabs, ref, sessionId);
        const label = (words.length ? words.join(' ') : String(args.name ?? '')).trim();
        renameTab(tab.id, label);
        return label ? `renamed ${tab.label} → ${label}` : `${tab.label} is back to its automatic name`;
      },
      'tabs.focus': (args, [ref = args.tab], { sessionId }) => {
        const { tabs, switchTab } = live.current.tabManager;
        const tab = target(tabs, ref, sessionId);
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
      'tasks.list': async (args, positional, { sessionId }) => {
        const scope = await taskScope(args, sessionId);
        const tasks = await live.current.tasks.getTasks(scope);
        return {
          scope: scope === GLOBAL ? 'global' : scope,
          tasks: tasks.map(({ id, title, notes, status }) => ({ id, title, notes, status })),
        };
      },
      'tasks.add': async (args, words, { sessionId }) => {
        const fields = splitTaskText(words.length ? words.join(' ') : String(args.title ?? ''));
        if (args.notes !== undefined) fields.notes = [fields.notes, String(args.notes)].filter(Boolean).join('\n\n');
        if (!fields.title) throw new Error('missing title: lirah tasks add <title> [--notes N] [--global]');
        const scope = await taskScope(args, sessionId);
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
        const to = from === GLOBAL ? await projectScope(sessionId) : GLOBAL;
        await live.current.tasks.moveToScope(from, to, id);
        live.current.toast.info(`Claude moved "${task.title}" to ${to === GLOBAL ? 'global tasks' : 'this project'}`);
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
