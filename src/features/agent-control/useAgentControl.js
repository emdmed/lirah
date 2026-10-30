import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../toast';
import { useConfirm } from '../dialogs/DialogProvider';
import { useTheme } from '../../contexts/ThemeContext';
import { getSettings, setSetting } from '../settings/settingsStore';
import { MAX_TABS, tabDisplayName, useTabManager } from '../tabs/TabContext';
import { useBookmarks } from '../bookmarks';
import {
  callerTab, getSetting, isGuarded, listSettings, listTabs, listThemes, prepareReset, prepareSetting,
  resolveTab, resolveTabPath, resolveTheme, settingsSchema,
} from './actions';

// Answers the `lirah` CLI. The Rust control server relays each request as an
// `agent-control` event {id, sessionId, cmd, args}; every one gets exactly one
// agent_control_reply. Mount once, inside the app's providers (it needs the
// tab and bookmark contexts).

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

const FAMILIES = { settings: 'list', theme: 'get', tabs: 'list' };

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
  // The listener is set up once; it reads the latest of these through the ref.
  const live = useRef({});
  live.current = { toast, confirm, theme, tabManager, bookmarks };

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
