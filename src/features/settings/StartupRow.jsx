import { X } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { useToast } from '../toast';
import { addStartupProject, removeStartupProject, setStartupMode } from '../agent-control/actions';
import { useSetting } from './settingsStore';
import { SETTINGS_ROW } from './settingsSections';
import { InlineChoice, Row, SubRows } from './parts';

const MODE_OPTIONS = [
  { value: 'restore', label: 'Restore last tabs' },
  { value: 'projects', label: 'Open startup projects' },
];

/**
 * What opens at launch: the mode, and the startup projects. Same actions and
 * stored values as `lirah startup`, so both always agree.
 */
export function StartupRow({ projectPath }) {
  const toast = useToast();
  const [mode] = useSetting('startupMode');
  const [projects] = useSetting('startupProjects');
  const current = projectPath?.replace(/\/+$/, '') || '';
  const listed = projects.some((p) => p.path === current);

  const run = (fn) => Promise.resolve().then(fn).catch((e) => toast.error(e?.message || String(e)));
  const add = () => run(() => addStartupProject(current));
  const remove = (path) => run(() => removeStartupProject(path));

  const hint = mode === 'projects' && projects.length === 0
    ? 'No startup projects yet, so the last tabs still restore.'
    : <>What opens when Lirah starts. Also <span className="text-foreground">lirah startup</span> from a tab.</>;

  // The project list only matters when startup opens it, so it shows with that mode.
  return (
    <Row
      id="startup"
      sectionId="agent"
      label={SETTINGS_ROW.startup.label}
      hint={hint}
      control={<InlineChoice label="Startup mode" value={mode} options={MODE_OPTIONS} onChange={(m) => run(() => setStartupMode(m))} />}
    >
      {mode === 'projects' && (
        <SubRows className="flex flex-col gap-1">
          {projects.length > 0 && (
            <ul className="flex flex-col gap-1">
              {projects.map((p) => (
                <li key={p.path} className="flex h-6 items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate" title={p.path}>
                    {p.name && <span className="text-foreground">{p.name} </span>}
                    <span className={p.name ? 'text-muted-foreground' : 'text-foreground'}>{p.path}</span>
                  </span>
                  {p.launch && <span className="shrink-0 text-[11px] text-muted-foreground">launch</span>}
                  <PanelButton
                    icon={X}
                    aria-label={`Remove ${p.name || p.path} from startup projects`}
                    title="Remove"
                    onClick={() => remove(p.path)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="-ml-1.5">
            <PanelButton className="text-xs" disabled={!current || listed} onClick={add} title={current || undefined}>
              {listed ? 'Current project is listed' : 'Add current project'}
            </PanelButton>
          </div>
        </SubRows>
      )}
    </Row>
  );
}
