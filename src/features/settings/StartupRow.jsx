import { X } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { useToast } from '../toast';
import { addStartupProject, removeStartupProject, setStartupMode } from '../agent-control/actions';
import { useSetting } from './settingsStore';
import { SETTINGS_ROW } from './settingsSections';
import { Choice, Row } from './parts';

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

  return (
    <Row id="startup" sectionId="agent" label={SETTINGS_ROW.startup.label} hint={hint}>
      <div className="flex flex-col gap-2.5">
        <Choice label="Startup mode" value={mode} options={MODE_OPTIONS} onChange={(m) => run(() => setStartupMode(m))} />
        {projects.length > 0 && (
          <ul className="flex flex-col gap-1 pl-3 shadow-[inset_1px_0_0_var(--ins-edge)]">
            {projects.map((p) => (
              <li key={p.path} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate" title={p.path}>
                  {p.name && <span className="text-foreground">{p.name} </span>}
                  <span className={p.name ? 'text-muted-foreground' : 'text-foreground'}>{p.path}</span>
                </span>
                {p.launch && <span className="shrink-0 text-[10px] text-muted-foreground">launch</span>}
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
        <div>
          <PanelButton className="text-xs" disabled={!current || listed} onClick={add} title={current || undefined}>
            {listed ? 'Current project is listed' : 'Add current project'}
          </PanelButton>
        </div>
      </div>
    </Row>
  );
}
