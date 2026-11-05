import { useState } from 'react';
import { open as openFolderPicker } from '@tauri-apps/plugin-dialog';
import { X } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { useToast } from '../toast';
import { useSetting } from './settingsStore';
import { SETTINGS_ROW } from './settingsSections';
import { DraftField, Row, SubRows } from './parts';

/**
 * User plugins: a folder of tools and skills plus a prompt. On each Claude
 * Code launch Lirah turns every enabled one into a plugin (skills copied, the
 * prompt and the folder's scripts given to the agent at session start).
 */
export function PluginsRow() {
  const toast = useToast();
  const [plugins, setPlugins] = useSetting('plugins');
  const [openId, setOpenId] = useState(null);

  const update = (id, patch) => setPlugins(plugins.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id) => setPlugins(plugins.filter((p) => p.id !== id));

  const add = async () => {
    try {
      const folder = await openFolderPicker({ directory: true, multiple: false, title: 'Choose plugin folder' });
      if (typeof folder !== 'string' || !folder) return;
      const name = folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'plugin';
      const id = `${name}-${Date.now().toString(36)}`;
      setPlugins([...plugins, { id, name, folder, prompt: '', enabled: true }]);
      setOpenId(id);
    } catch (e) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Row
      id="plugins"
      sectionId="agent"
      label={SETTINGS_ROW.plugins.label}
      hint="Folders of tools and skills for Claude Code. Lirah loads each folder's skills, lists its scripts and gives the agent your prompt at session start. Applies to agents launched after the change."
    >
      <SubRows className="flex flex-col gap-1">
        {plugins.length > 0 && (
          <ul className="flex flex-col gap-1">
            {plugins.map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                <div className="flex h-6 items-center gap-2 text-xs">
                  <ToggleSwitch
                    checked={p.enabled}
                    onChange={(enabled) => update(p.id, { enabled })}
                    label={`Use plugin ${p.name}`}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    title={p.folder}
                    aria-expanded={openId === p.id}
                    onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  >
                    <span className="text-foreground">{p.name} </span>
                    <span className="text-muted-foreground">{p.folder}</span>
                  </button>
                  {!p.prompt.trim() && <span className="shrink-0 text-[11px] text-muted-foreground">no prompt</span>}
                  <PanelButton icon={X} aria-label={`Remove plugin ${p.name}`} title="Remove" onClick={() => remove(p.id)} />
                </div>
                {openId === p.id && (
                  <div className="flex flex-col gap-1 pb-1">
                    <DraftField
                      id={`settings-plugin-name-${p.id}`}
                      aria-label="Plugin name"
                      value={p.name}
                      fallback={p.name}
                      onCommit={(name) => update(p.id, { name })}
                    />
                    <DraftField
                      id={`settings-plugin-prompt-${p.id}`}
                      aria-label={`Prompt for ${p.name}`}
                      multiline
                      value={p.prompt}
                      onCommit={(prompt) => update(p.id, { prompt })}
                      placeholder="How the agent should use this folder, e.g. Use bin/az-wrap instead of az for every Azure command."
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="-ml-1.5">
          <PanelButton className="text-xs" onClick={add}>Add plugin folder…</PanelButton>
        </div>
      </SubRows>
    </Row>
  );
}
