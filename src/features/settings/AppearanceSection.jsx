import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';
import { Detent } from '../../components/instrument/Detent';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { useSetting, ROYAL_NUGGETS } from './settingsStore';
import { Row, Section, ToggleRow } from './parts';
import { SECTIONS, SETTINGS_ROW } from './settingsSections';

// The theme's own terminal palette, so each row previews what it looks like.
function ThemeSwatch({ terminal }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-3.5 w-9 shrink-0 items-end gap-px p-[2px] edge-engraved"
      style={{ background: terminal.background }}
    >
      {[terminal.red, terminal.green, terminal.yellow, terminal.blue].map((c, i) => (
        <span key={i} className="h-full flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

function ThemeList({ themes, value, onChange }) {
  const groups = useMemo(() => {
    const entries = Object.entries(themes);
    return [
      { label: 'Dark', items: entries.filter(([, t]) => t.type !== 'light') },
      { label: 'Light', items: entries.filter(([, t]) => t.type === 'light') },
    ].filter((g) => g.items.length);
  }, [themes]);
  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{g.label}</span>
          <div className="grid grid-cols-2 gap-x-2">
            {g.items.map(([id, t]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={value === id}
                onClick={() => onChange(id)}
                className={cn(
                  'flex h-6 items-center gap-2 pl-4 pr-2 text-left text-xs text-muted-foreground hover:text-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1',
                  value === id && 'ins-row-selected text-foreground',
                )}
              >
                <ThemeSwatch terminal={t.terminal} />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const LAMP_OPTIONS = [
  { value: 'reticle', label: 'reticle', title: 'A sight: ring, crosshair and dot' },
  { value: 'gem', label: 'gem', title: 'A domed cabochon set in gold' },
  { value: 'mon', label: 'mon', title: 'A twelve-petal crest; turns while it waits on you' },
];

// The royal nuggets, in the order the Regalia row lists them.
const NUGGET_LABELS = {
  seal: ['Wax seal', 'A red seal stamped with the lyre beside "needs you".'],
  initial: ['Illuminated initial', 'The focused pane\'s first letter in gold on vermilion.'],
  coronet: ['Coronet', 'A small crown on the current tab, instead of its corner ticks.'],
  corners: ['Tooled corners', 'A gilt ornament in each pane corner.'],
  tinctures: ['Heraldic tinctures', 'Each workspace gets a hatched heraldic shield.'],
  beads: ['Beaded border', 'The focused pane is framed in gold beads.'],
  guilloche: ['Guilloché', 'Faint engraved waves on the panels.'],
  ermine: ['Ermine desk', 'The desk as white ermine. Themes with a light desk only.'],
};

// One switch per nugget; ermine needs a desk set apart from the panels.
function RegaliaRow({ hasDesk }) {
  const [royal, setRoyal] = useSetting('royal');
  const row = SETTINGS_ROW.regalia;
  const toggle = (name, on) => setRoyal((list) => ROYAL_NUGGETS.filter((n) => (n === name ? on : list.includes(n))));
  return (
    <Row id={row.id} sectionId="appearance" label={row.label} hint={row.hint}>
      <div className="flex flex-col">
        {ROYAL_NUGGETS.map((name) => {
          const [label, hint] = NUGGET_LABELS[name];
          const disabled = name === 'ermine' && !hasDesk;
          return (
            <label key={name} className={cn('flex h-6 items-center gap-2 text-xs', disabled ? 'text-faint' : 'text-muted-foreground')} title={disabled ? 'Needs a theme with a light desk (Shire, Rivendell Silver, Lothlórien Birch)' : hint}>
              <ToggleSwitch checked={royal.includes(name)} onChange={(on) => toggle(name, on)} disabled={disabled} label={label} />
              <span className={cn(royal.includes(name) && !disabled && 'text-foreground')}>{label}</span>
            </label>
          );
        })}
      </div>
    </Row>
  );
}

const FIGURE_OPTIONS = [
  { value: 'full', label: 'full', title: 'Print scales, values and leaders' },
  { value: 'compact', label: 'compact', title: 'Marks only; values in the tooltip' },
];

/** The Appearance section: the theme, the window's title bar, and figures. */
export function AppearanceSection({ active, showTitleBar, onShowTitleBarChange }) {
  const { currentTheme, themes, changeTheme } = useTheme();
  const [figures, setFigures] = useSetting('figures');
  const [zenMode, setZenMode] = useSetting('zenMode');
  const [lampStyle, setLampStyle] = useSetting('lampStyle');
  const lampRow = SETTINGS_ROW['lamp-style'];
  const figuresRow = SETTINGS_ROW.figures;
  return (
    <Section section={SECTIONS.find((s) => s.id === 'appearance')} active={active}>
      <Row id="theme" sectionId="appearance" label={SETTINGS_ROW.theme.label}>
        <ThemeList themes={themes} value={currentTheme} onChange={changeTheme} />
      </Row>
      <ToggleRow row={SETTINGS_ROW['title-bar']} value={showTitleBar} onChange={onShowTitleBarChange} />
      <ToggleRow row={SETTINGS_ROW['zen-mode']} value={zenMode} onChange={setZenMode} />
      <Row id={figuresRow.id} sectionId="appearance" label={figuresRow.label} hint={figuresRow.hint}>
        <Detent
          label={figuresRow.label}
          value={figures}
          options={FIGURE_OPTIONS}
          onChange={setFigures}
          className="w-40"
        />
      </Row>
      <Row id={lampRow.id} sectionId="appearance" label={lampRow.label} hint={lampRow.hint}>
        <Detent label={lampRow.label} value={lampStyle} options={LAMP_OPTIONS} onChange={setLampStyle} className="w-48" />
      </Row>
      <RegaliaRow hasDesk={!!themes[currentTheme]?.ui.gutter} />
    </Section>
  );
}
