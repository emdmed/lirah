import { useCallback, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
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
import { TAB_CLIS } from '../../lib/agentClis';
import { FilterContext, SECTIONS } from './settingsSections';
import { Choice, DraftField, Row, Section } from './parts';
import { AppearanceSection } from './AppearanceSection';
import { useSettingsNav } from './useSettingsNav';

const CLI_OPTIONS = TAB_CLIS.map((c) => ({ value: c.id, label: c.title, short: c.process }));

const TRIGGER_OPTIONS = [
  { value: 'commit', label: 'Every commit' },
  { value: 'merge', label: 'Merge to main' },
];

function useScrollback() {
  return useSyncExternalStore(subscribeTerminalPrefs, getScrollback);
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
  const { currentTheme, themes } = useTheme();
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

  const {
    activeId, query, setQuery, filtering, filterValue, matchCounts, totalMatches, filterRef, tabRefs,
    selectSection, handleOpenAutoFocus, handleEscape, handleKeyDown, handleRailKeyDown,
  } = useSettingsNav();

  // Both restart this tab's terminal, so ask first while a session is live.
  // `what` names the setting in the explanation.
  const confirmRestart = useCallback(async (title, what, toggle) => {
    if (sessionId && !(await confirm({
      title,
      description: `${what} is applied when the terminal starts, so this tab's terminal restarts and any running process in it is stopped.`,
      confirmLabel: 'Restart',
    }))) return;
    toggle();
  }, [sessionId, confirm]);
  const toggleSandbox = () => confirmRestart(
    'Restart terminal with sandbox ' + (sandboxEnabled ? 'off' : 'on') + '?', 'The sandbox', onToggleSandbox,
  );
  const toggleNetwork = () => confirmRestart(
    (networkIsolation ? 'Allow' : 'Block') + ' network and restart terminal?', 'Network isolation', onToggleNetwork,
  );

  const openBudget = useCallback(() => {
    onOpenChange(false);
    onOpenBudget();
  }, [onOpenChange, onOpenBudget]);

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

                <AppearanceSection
                  active={activeId === 'appearance'}
                  showTitleBar={showTitleBar}
                  onShowTitleBarChange={setShowTitleBar}
                />

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
