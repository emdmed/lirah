import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Keycap, KeyChord } from '../../components/instrument/Keycap';
import { Lamp } from '../../components/instrument/Lamp';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';
import { useWatcher } from '../watcher/WatcherContext';
import { useConfirm } from '../confirm/ConfirmContext';
import { useSetting } from './settingsStore';
import {
  getScrollback, setScrollback, subscribeTerminalPrefs,
  SCROLLBACK_OPTIONS, SCROLLBACK_WARN_THRESHOLD,
} from '../../lib/terminalPrefs';

const CLI_OPTIONS = [
  { value: 'claude-code', label: 'Claude Code', short: 'claude' },
  { value: 'opencode', label: 'OpenCode', short: 'opencode' },
];

const TRIGGER_OPTIONS = [
  { value: 'commit', label: 'Every commit' },
  { value: 'merge', label: 'Merge to main' },
];

// Section index: the rail, the 1–6 keys and the filter all read from this.
// `rows` maps a row id to the words it should match (its label plus synonyms).
const SECTIONS = [
  {
    id: 'agent', title: 'Agent', blurb: 'Which CLI starts, and what a prompt keeps after sending.',
    rows: {
      'default-cli': 'default cli claude code opencode agent new tabs',
      'auto-launch': 'auto-launch launch starred projects start cli',
      'keep-context': 'keep context after send files elements repos',
    },
  },
  {
    id: 'appearance', title: 'Appearance', blurb: 'Theme and window chrome.',
    rows: {
      theme: 'theme colors dark light palette',
      'title-bar': 'title bar window chrome',
    },
  },
  {
    id: 'terminal', title: 'Terminal', blurb: 'Terminal memory and the files pane.',
    rows: {
      scrollback: 'scrollback lines history memory buffer',
      'file-watching': 'file watching watch refresh files pane disk',
    },
  },
  {
    id: 'git', title: 'Git', blurb: 'Agent-written commit messages and changelog entries.',
    rows: {
      'auto-commit': 'auto commit cli message agent',
      'commit-prompt': 'extra commit instructions prompt message',
      changelog: 'auto changelog trigger target file cli',
    },
  },
  {
    id: 'budget', title: 'Budget', blurb: 'Token limits for this project.',
    rows: { budget: 'token budget daily weekly limit cost' },
  },
  {
    id: 'sandbox', title: 'Sandbox', blurb: 'Run this tab\'s terminal in a bubblewrap jail.',
    rows: {
      sandbox: 'sandbox bubblewrap jail isolation security',
      network: 'network isolation offline block internet',
    },
  },
];

// Where the dialog reopens: the last section viewed this session.
let lastSectionId = SECTIONS[0].id;

const FilterContext = createContext({ query: '', filtering: false });

function rowMatches(words, query) {
  return query.split(/\s+/).every((term) => words.includes(term));
}

function useScrollback() {
  return useSyncExternalStore(subscribeTerminalPrefs, getScrollback);
}

// A section's rows. While filtering, every section with a match is shown at
// once, each under its own legend; otherwise only the active one.
function Section({ section, active, children }) {
  const { query, filtering } = useContext(FilterContext);
  const hasMatch = filtering && Object.values(section.rows).some((w) => rowMatches(w, query));
  if (filtering ? !hasMatch : !active) return null;
  return (
    <section
      id={`settings-panel-${section.id}`}
      role={filtering ? undefined : 'tabpanel'}
      aria-labelledby={filtering ? undefined : `settings-tab-${section.id}`}
      className="flex flex-col"
    >
      <header className="mb-4 flex flex-col gap-1">
        <h3 className="ins-legend text-[11px] text-foreground">{section.title}</h3>
        {!filtering && <p className="text-[11px] text-muted-foreground">{section.blurb}</p>}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

// One setting. Label and inline control share a line joined by a dotted
// leader, like a spec sheet; the hint sits under the label; wide controls
// (choices, fields, lists) take the full width below.
function Row({ id, sectionId, label, hint, control, children, htmlFor }) {
  const { query, filtering } = useContext(FilterContext);
  if (filtering) {
    const words = SECTIONS.find((s) => s.id === sectionId)?.rows[id] ?? '';
    if (!rowMatches(words, query)) return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="shrink-0 text-xs text-foreground">{label}</label>
        {control && (
          <>
            <span aria-hidden="true" className="h-px flex-1 translate-y-[3px] border-b border-dotted border-[var(--ins-edge-strong)]" />
            <span className="flex shrink-0 items-center gap-2">{control}</span>
          </>
        )}
      </div>
      {hint && <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>}
      {children && <div className="pt-1">{children}</div>}
    </div>
  );
}

// Latching buttons for a one-of-n choice.
function Choice({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <PanelButton
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          aria-pressed={undefined}
          latched={value === o.value}
          onClick={() => onChange(o.value)}
          className="text-xs"
        >
          {o.label}
        </PanelButton>
      ))}
    </div>
  );
}

// A text field that writes to the store on blur, not per keystroke: every
// write re-renders each open tab.
function DraftField({ id, value, onCommit, multiline, fallback = '', ...props }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = useCallback(() => {
    const next = draft.trim() ? draft : fallback;
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  }, [draft, fallback, value, onCommit]);
  const Field = multiline ? Textarea : Input;
  return (
    <Field
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className={multiline ? 'min-h-[64px] text-xs' : 'h-7 text-xs'}
      {...props}
    />
  );
}

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

// What the sandbox does, as facts rather than a paragraph.
const SANDBOX_SPEC = [
  ['writable', 'project folder, home'],
  ['read-only', 'rest of the system, .ssh, .gnupg, shell rc files'],
  ['cleared', 'environment variables'],
  ['not covered', 'secondary terminal, background agent jobs'],
];

export function SettingsDialog({
  open, onOpenChange, settings, sessionId, onToggleSandbox, onToggleNetwork, onOpenBudget,
}) {
  const { currentTheme, themes, changeTheme } = useTheme();
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();
  const confirm = useConfirm();
  const scrollback = useScrollback();
  // The store's CLI is the default for new tabs; this tab's own CLI is
  // chosen from the status bar.
  const [defaultCli, setDefaultCli] = useSetting('selectedCli');

  const {
    showTitleBar, setShowTitleBar,
    autoLaunchCli, setAutoLaunchCli,
    keepFilesAfterSend, setKeepFilesAfterSend,
    autoCommitCli, setAutoCommitCli,
    autoCommitCustomPrompt, setAutoCommitCustomPrompt,
    autoChangelogEnabled, setAutoChangelogEnabled,
    autoChangelogTrigger, setAutoChangelogTrigger,
    autoChangelogCli, setAutoChangelogCli,
    autoChangelogTarget, setAutoChangelogTarget,
    sandboxEnabled, sandboxFailed, networkIsolation,
  } = settings;

  const [activeId, setActiveId] = useState(lastSectionId);
  const [query, setQuery] = useState('');
  const filterRef = useRef(null);
  const tabRefs = useRef({});

  const normalizedQuery = query.trim().toLowerCase();
  const filtering = normalizedQuery.length > 0;
  const filterValue = useMemo(() => ({ query: normalizedQuery, filtering }), [normalizedQuery, filtering]);

  const matchCounts = useMemo(() => {
    if (!filtering) return null;
    return Object.fromEntries(SECTIONS.map((s) => [
      s.id, Object.values(s.rows).filter((w) => rowMatches(w, normalizedQuery)).length,
    ]));
  }, [filtering, normalizedQuery]);
  const totalMatches = matchCounts ? Object.values(matchCounts).reduce((a, b) => a + b, 0) : 0;

  const selectSection = useCallback((id, { focus = false } = {}) => {
    lastSectionId = id;
    setActiveId(id);
    setQuery('');
    if (focus) tabRefs.current[id]?.focus();
  }, []);

  // Both restart this tab's terminal, so ask first while a session is live.
  const toggleSandbox = useCallback(async () => {
    if (sessionId && !(await confirm({
      title: 'Restart terminal with sandbox ' + (sandboxEnabled ? 'off' : 'on') + '?',
      description: 'The sandbox is applied when the terminal starts, so this tab\'s terminal restarts and any running process in it is stopped.',
      confirmLabel: 'Restart',
    }))) return;
    onToggleSandbox();
  }, [sessionId, sandboxEnabled, confirm, onToggleSandbox]);

  const toggleNetwork = useCallback(async () => {
    if (sessionId && !(await confirm({
      title: (networkIsolation ? 'Allow' : 'Block') + ' network and restart terminal?',
      description: 'Network isolation is applied when the terminal starts, so this tab\'s terminal restarts and any running process in it is stopped.',
      confirmLabel: 'Restart',
    }))) return;
    onToggleNetwork();
  }, [sessionId, networkIsolation, confirm, onToggleNetwork]);

  const openBudget = useCallback(() => {
    onOpenChange(false);
    onOpenBudget();
  }, [onOpenChange, onOpenBudget]);

  // Open on the active section's rail key, so arrows and 1–6 work at once.
  const handleOpenAutoFocus = useCallback((e) => {
    e.preventDefault();
    tabRefs.current[activeId]?.focus();
  }, [activeId]);

  // Esc clears an active filter before it closes the dialog.
  const handleEscape = useCallback((e) => {
    if (!query) return;
    e.preventDefault();
    setQuery('');
    tabRefs.current[activeId]?.focus();
  }, [query, activeId]);

  // `/` filters and 1–6 jump to a section, unless the user is typing.
  const handleKeyDown = useCallback((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      filterRef.current?.focus();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= SECTIONS.length) {
      e.preventDefault();
      selectSection(SECTIONS[n - 1].id, { focus: true });
    }
  }, [selectSection]);

  // Vertical tablist: arrows, Home and End move and select.
  const handleRailKeyDown = useCallback((e) => {
    const i = SECTIONS.findIndex((s) => s.id === activeId);
    const next = {
      ArrowDown: (i + 1) % SECTIONS.length,
      ArrowUp: (i - 1 + SECTIONS.length) % SECTIONS.length,
      Home: 0,
      End: SECTIONS.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectSection(SECTIONS[next].id, { focus: true });
  }, [activeId, selectSection]);

  const scrollbackShort = scrollback >= 1000 ? `${scrollback / 1000}k` : String(scrollback);
  const readouts = {
    agent: CLI_OPTIONS.find((o) => o.value === defaultCli)?.short,
    appearance: themes[currentTheme]?.name,
    terminal: scrollbackShort,
    git: <Lamp state={autoChangelogEnabled ? 'on' : 'off'} label={autoChangelogEnabled ? 'Changelog on' : 'Changelog off'} />,
    budget: null,
    sandbox: <Lamp state={sandboxEnabled ? (sandboxFailed ? 'fault' : 'ok') : 'off'} label={sandboxEnabled ? (sandboxFailed ? 'Sandbox failed' : 'Sandbox on') : 'Sandbox off'} />,
  };

  const scrollbackOptions = SCROLLBACK_OPTIONS.map((o) => ({ value: o.value, label: o.label.replace(' lines', '') }));
  const section = (id) => SECTIONS.find((s) => s.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[780px] max-w-[95vw] h-[min(600px,85vh)] flex flex-col gap-0 overflow-hidden"
        onOpenAutoFocus={handleOpenAutoFocus}
        onEscapeKeyDown={handleEscape}
        onKeyDown={handleKeyDown}
      >
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Preferences for Lirah. Changes save right away and reach every open tab; sandbox settings apply to this tab.
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[184px_1px_minmax(0,1fr)] gap-x-5 pt-1">
          {/* Rail: filter, then the section keys with their current state. */}
          <nav className="flex min-h-0 flex-col gap-3" aria-label="Settings sections">
            <div className="relative">
              <Input
                ref={filterRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter"
                aria-label="Filter settings"
                className="h-7 pr-7 text-xs"
              />
              {!query && <Keycap size="sm" className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">/</Keycap>}
            </div>

            <div role="tablist" aria-orientation="vertical" aria-label="Sections" className="flex flex-col" onKeyDown={handleRailKeyDown}>
              {SECTIONS.map((s, i) => {
                const selected = !filtering && s.id === activeId;
                const count = matchCounts?.[s.id];
                return (
                  <button
                    key={s.id}
                    ref={(el) => { tabRefs.current[s.id] = el; }}
                    id={`settings-tab-${s.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`settings-panel-${s.id}`}
                    tabIndex={s.id === activeId ? 0 : -1}
                    onClick={() => selectSection(s.id)}
                    className={cn(
                      'flex h-7 items-center gap-2 pl-4 pr-2 text-left text-xs text-muted-foreground hover:text-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1',
                      selected && 'ins-row-selected text-foreground',
                      filtering && count === 0 && 'opacity-40',
                    )}
                  >
                    <Keycap size="sm" lit={selected}>{i + 1}</Keycap>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="flex max-w-[64px] shrink-0 items-center truncate text-[10px] text-muted-foreground">
                      {filtering ? (count > 0 ? count : '') : readouts[s.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-auto text-[10px] leading-snug text-muted-foreground">
              Saved as you change them, in every open tab. Sandbox applies to this tab only.
            </p>
          </nav>

          <span aria-hidden="true" className="bg-[var(--ins-edge)]" />

          {/* Settings pane. Fixed height so switching sections doesn't jump. */}
          <FilterContext.Provider value={filterValue}>
            <div className="min-h-0 overflow-y-auto pb-2 pr-2">
              {filtering && totalMatches === 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  No settings match “{query.trim()}”. <span className="text-foreground">esc</span> clears the filter.
                </p>
              )}
              <div className="flex flex-col gap-8">
                <Section section={section('agent')} active={activeId === 'agent'}>
                  <Row id="default-cli" sectionId="agent" label="Default CLI" hint="New tabs start with it. Switch this tab's CLI from the status bar.">
                    <Choice label="Default CLI" value={defaultCli} options={CLI_OPTIONS} onChange={setDefaultCli} />
                  </Row>
                  <Row
                    id="auto-launch" sectionId="agent"
                    label="Auto-launch on starred projects"
                    hint="Start the CLI when you open a starred project. Tabs restored at startup are left alone."
                    control={<ToggleSwitch checked={autoLaunchCli} onChange={setAutoLaunchCli} label="Auto-launch on starred projects" />}
                  />
                  <Row
                    id="keep-context" sectionId="agent"
                    label="Keep context after send"
                    hint="Attached files, elements and linked repos stay for the next prompt."
                    control={<ToggleSwitch checked={keepFilesAfterSend} onChange={setKeepFilesAfterSend} label="Keep context after send" />}
                  />
                </Section>

                <Section section={section('appearance')} active={activeId === 'appearance'}>
                  <Row id="theme" sectionId="appearance" label="Theme">
                    <ThemeList themes={themes} value={currentTheme} onChange={changeTheme} />
                  </Row>
                  <Row
                    id="title-bar" sectionId="appearance"
                    label="Title bar"
                    hint="Window title bar above the panes."
                    control={<ToggleSwitch checked={showTitleBar} onChange={setShowTitleBar} label="Title bar" />}
                  />
                </Section>

                <Section section={section('terminal')} active={activeId === 'terminal'}>
                  <Row
                    id="scrollback" sectionId="terminal"
                    label="Scrollback"
                    hint={scrollback > SCROLLBACK_WARN_THRESHOLD
                      ? <span className="text-[var(--ins-warn)]">Lines kept per terminal. This depth uses a lot of memory and slows resizing.</span>
                      : 'Lines kept per terminal.'}
                  >
                    <Choice label="Scrollback" value={scrollback} options={scrollbackOptions} onChange={setScrollback} />
                  </Row>
                  <Row
                    id="file-watching" sectionId="terminal"
                    label="File watching"
                    hint={<>Refresh the files pane when files change on disk. Also <span className="text-foreground">:watch</span> in the palette.</>}
                    control={<ToggleSwitch checked={fileWatchingEnabled} onChange={toggleWatchers} label="File watching" />}
                  />
                </Section>

                <Section section={section('git')} active={activeId === 'git'}>
                  <Row
                    id="auto-commit" sectionId="git"
                    label="Auto commit"
                    hint={<span className="inline-flex flex-wrap items-center gap-1">Writes the message with an agent, then commits. Run it with <KeyChord keys={['^', '⇧', 'space']} size="sm" /></span>}
                  >
                    <Choice label="Auto commit CLI" value={autoCommitCli} options={CLI_OPTIONS} onChange={setAutoCommitCli} />
                  </Row>
                  <Row id="commit-prompt" sectionId="git" label="Extra commit instructions" htmlFor="settings-commit-prompt" hint="Added to the default prompt. Leave empty for the default.">
                    <DraftField
                      id="settings-commit-prompt"
                      multiline
                      value={autoCommitCustomPrompt}
                      onCommit={setAutoCommitCustomPrompt}
                      placeholder="e.g. Use imperative mood. Prefix with ticket number PROJ-123."
                    />
                  </Row>
                  <Row
                    id="changelog" sectionId="git"
                    label="Auto changelog"
                    hint="An agent updates a changelog file after commits or merges."
                    control={<ToggleSwitch checked={autoChangelogEnabled} onChange={setAutoChangelogEnabled} label="Auto changelog" />}
                  >
                    {autoChangelogEnabled && (
                      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 pl-3 shadow-[inset_1px_0_0_var(--ins-edge)]">
                        <span className="text-[11px] text-muted-foreground">Trigger</span>
                        <Choice label="Changelog trigger" value={autoChangelogTrigger} options={TRIGGER_OPTIONS} onChange={setAutoChangelogTrigger} />
                        <span className="text-[11px] text-muted-foreground">CLI</span>
                        <Choice label="Changelog CLI" value={autoChangelogCli} options={CLI_OPTIONS} onChange={setAutoChangelogCli} />
                        <label htmlFor="settings-changelog-target" className="text-[11px] text-muted-foreground">Target file</label>
                        <DraftField
                          id="settings-changelog-target"
                          value={autoChangelogTarget}
                          onCommit={setAutoChangelogTarget}
                          fallback="CHANGELOG.md"
                          placeholder="CHANGELOG.md"
                        />
                      </div>
                    )}
                  </Row>
                </Section>

                <Section section={section('budget')} active={activeId === 'budget'}>
                  <Row
                    id="budget" sectionId="budget"
                    label="Token budget"
                    hint="Daily and weekly token limits, with alerts as you near them."
                    control={<PanelButton onClick={openBudget} className="text-xs">Edit budget…</PanelButton>}
                  />
                </Section>

                <Section section={section('sandbox')} active={activeId === 'sandbox'}>
                  <Row
                    id="sandbox" sectionId="sandbox"
                    label="Sandbox"
                    hint="Applies to this tab. Turning it on or off restarts the terminal."
                    control={<ToggleSwitch checked={sandboxEnabled} onChange={toggleSandbox} label="Sandbox" />}
                  >
                    {sandboxEnabled && sandboxFailed && (
                      <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--ins-fault)]">
                        <Lamp state="fault" /> The sandbox failed to start in this tab.
                      </div>
                    )}
                    <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                      {SANDBOX_SPEC.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="text-foreground">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </Row>
                  <Row
                    id="network" sectionId="sandbox"
                    label="Network isolation"
                    hint={sandboxEnabled
                      ? 'Cut the sandboxed terminal off from the network. Restarts the terminal.'
                      : 'Needs the sandbox on.'}
                    control={
                      <ToggleSwitch
                        checked={networkIsolation}
                        onChange={toggleNetwork}
                        disabled={!sandboxEnabled}
                        tone="warn"
                        label="Network isolation"
                      />
                    }
                  />
                </Section>
              </div>
            </div>
          </FilterContext.Provider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
