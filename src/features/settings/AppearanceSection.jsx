import { useMemo } from 'react';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';
import { Row, Section } from './parts';
import { SECTIONS } from './settingsSections';

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
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</span>
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

/** The Appearance section: the theme, and the window's title bar. */
export function AppearanceSection({ active, showTitleBar, onShowTitleBarChange }) {
  const { currentTheme, themes, changeTheme } = useTheme();
  return (
    <Section section={SECTIONS.find((s) => s.id === 'appearance')} active={active}>
      <Row id="theme" sectionId="appearance" label="Theme">
        <ThemeList themes={themes} value={currentTheme} onChange={changeTheme} />
      </Row>
      <Row
        id="title-bar" sectionId="appearance"
        label="Title bar"
        hint="Window title bar above the panes."
        control={<ToggleSwitch checked={showTitleBar} onChange={onShowTitleBarChange} label="Title bar" />}
      />
    </Section>
  );
}
