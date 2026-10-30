import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../toast';
import { useConfirm } from '../dialogs/DialogProvider';
import { useTheme } from '../../contexts/ThemeContext';
import { getSettings, setSetting } from '../settings/settingsStore';
import {
  getSetting, isGuarded, listSettings, listThemes, prepareReset, prepareSetting,
  resolveTheme, settingsSchema,
} from './actions';

// Answers the `lirah` CLI. The Rust control server relays each request as an
// `agent-control` event {id, sessionId, cmd, args}; every one gets exactly one
// agent_control_reply. Mount once, inside the app's providers.

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

// `lirah settings set x 1` arrives as cmd "settings" with args._ ["set", "x", "1"];
// a dotted cmd ("settings.set") is taken as is. Returns [cmd, positionals].
function normalize(cmd, args) {
  const positional = Array.isArray(args?._) ? args._.map(String) : [];
  if (typeof cmd === 'string' && !cmd.includes('.') && (cmd === 'settings' || cmd === 'theme')) {
    const [sub, ...rest] = positional;
    return [`${cmd}.${sub || (cmd === 'theme' ? 'get' : 'list')}`, rest];
  }
  return [cmd, positional];
}

export function useAgentControl() {
  const toast = useToast();
  const confirm = useConfirm();
  const theme = useTheme();
  // The listener is set up once; it reads the latest of these through the ref.
  const live = useRef({});
  live.current = { toast, confirm, theme };

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
    };

    const reply = (id, ok, data, error) => invoke('agent_control_reply', { id, ok, data, error })
      .catch((e) => console.warn('agent_control_reply failed:', e));

    const handle = async ({ id, cmd, args }) => {
      try {
        if (!getSettings().agentControl) {
          throw new Error('agent control is off in Lirah\'s settings (Agent → Agent control)');
        }
        const [name, positional] = normalize(cmd, args);
        const handler = handlers[name];
        if (!handler) {
          throw new Error(`unknown command "${name}"; known: ${Object.keys(handlers).join(', ')}`);
        }
        const data = await handler(args && typeof args === 'object' ? args : {}, positional);
        await reply(id, true, data ?? null, null);
      } catch (e) {
        await reply(id, false, null, e?.message || String(e));
      }
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
