import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { PanelButton } from '../../components/instrument/PanelButton';
import { Keycap, KeyChord } from '../../components/instrument/Keycap';
import { Lamp } from '../../components/instrument/Lamp';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';
import { useWatcher } from '../watcher/WatcherContext';
import { useConfirm } from '../dialogs/DialogProvider';
import { useSetting } from './settingsStore';
import {
  getScrollback, setScrollback, subscribeTerminalPrefs,
  SCROLLBACK_OPTIONS, SCROLLBACK_WARN_THRESHOLD,
} from '../../lib/terminalPrefs';
import { TAB_CLIS } from '../../lib/agentClis';
import { shortcutForCommand } from '../../lib/shortcuts';
import { FilterContext, SECTIONS, SETTINGS_ROW as ROW } from './settingsSections';
import { Choice, ChoiceRow, DraftField, Group, Row, Section, StepRow, SubRows, ToggleRow } from './parts';
import { AppearanceSection } from './AppearanceSection';
import { StartupRow } from './StartupRow';
import { useSettingsNav } from './useSettingsNav';
import { Fig10Sandbox } from './Fig10Sandbox';
import { lazyNamed } from '../../lib/lazyNamed';
import { usePlanContexts } from '../tasks/planContexts';
import { CLI_COMMANDS } from '../cli-selection/useClaudeLauncher';

const PlanContextsDialog = lazyNamed(() => import('../tasks/PlanContextsDialog'), 'PlanContextsDialog');

const CLI_OPTIONS = TAB_CLIS.map((c) => ({ value: c.id, label: c.title, short: c.process }));

// The auto commit shortcut, as the hint bar shows it.
const COMMIT_KEYS = shortcutForCommand('commit');

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

function SandboxSpecList() {
  return (
    <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
      {SANDBOX_SPEC.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SettingsDialog({
  open, onOpenChange, settings, sessionId, projectPath, onToggleSandbox, onToggleNetwork, onOpenBudget,
}) {
  const { currentTheme, themes } = useTheme();
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();
  const confirm = useConfirm();
  const scrollback = useScrollback();
  // The store's CLI is the default for new tabs; this tab's own CLI is
  // chosen from the status bar.
  const [defaultCli, setDefaultCli] = useSetting('selectedCli');
  const [agentStateHook, setAgentStateHook] = useSetting('agentStateHook');
  const [compactionHook, setCompactionHook] = useSetting('compactionHook');
  const [promptBoxOnStart, setPromptBoxOnStart] = useSetting('promptBoxOnStart');
  const [agentControl, setAgentControl] = useSetting('agentControl');
  const [autoChunkTaskPlans, setAutoChunkTaskPlans] = useSetting('autoChunkTaskPlans');

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

  const scrollbackSteps = SCROLLBACK_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    short: o.value >= 1000 ? `${o.value / 1000}k` : String(o.value),
  }));
  const section = (id) => SECTIONS.find((s) => s.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[780px] h-[min(600px,85vh)] flex flex-col gap-0 overflow-hidden"
        status={filtering
          ? `${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'}`
          : section(activeId)?.title.toLowerCase()}
        hints={[
          { keys: ['1–6'], label: 'section' },
          { keys: ['/'], label: 'filter' },
        ]}
        onOpenAutoFocus={handleOpenAutoFocus}
        onEscapeKeyDown={handleEscape}
        onKeyDown={handleKeyDown}
      >
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Preferences for Lirah. Changes save right away and reach every open tab; sandbox settings apply to this tab.
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[204px_1px_minmax(0,1fr)] gap-x-5 pt-1">
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
                    <span className="shrink-0">{s.title}</span>
                    {/* The readout gives way before the section name does. */}
                    <span className="flex min-w-0 flex-1 items-center justify-end text-[10px] text-muted-foreground">
                      <span className="truncate">
                      {filtering ? (count > 0 ? count : '') : readouts[s.id]}
                      </span>
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
                  <Group label="Launch" sectionId="agent" rows={['default-cli', 'claude-command', 'auto-launch', 'startup']}>
                    <ChoiceRow row={ROW['default-cli']} value={defaultCli} options={CLI_OPTIONS} onChange={setDefaultCli} />
                    <ClaudeCommandRow />
                    <ToggleRow row={ROW['auto-launch']} value={autoLaunchCli} onChange={setAutoLaunchCli} />
                    <StartupRow projectPath={projectPath} />
                  </Group>
                  <Group label="Prompt" sectionId="agent" rows={['keep-context', 'prompt-box']}>
                    <ToggleRow row={ROW['keep-context']} value={keepFilesAfterSend} onChange={setKeepFilesAfterSend} />
                    <ToggleRow row={ROW['prompt-box']} value={promptBoxOnStart} onChange={setPromptBoxOnStart} />
                  </Group>
                  <Group label="Tasks" sectionId="agent" rows={['plan-contexts', 'auto-chunk']}>
                    <PlanContextsRow />
                    <ToggleRow row={ROW['auto-chunk']} value={autoChunkTaskPlans} onChange={setAutoChunkTaskPlans} />
                  </Group>
                  <Group label="Integration" sectionId="agent" rows={['agent-state-hook', 'compaction-hook', 'agent-control']}>
                    <ToggleRow row={ROW['agent-state-hook']} value={agentStateHook} onChange={setAgentStateHook} />
                    <ToggleRow row={ROW['compaction-hook']} value={compactionHook} onChange={setCompactionHook} />
                    <ToggleRow row={ROW['agent-control']} value={agentControl} onChange={setAgentControl} />
                  </Group>
                </Section>

                <AppearanceSection
                  active={activeId === 'appearance'}
                  showTitleBar={showTitleBar}
                  onShowTitleBarChange={setShowTitleBar}
                />

                <Section section={section('terminal')} active={activeId === 'terminal'}>
                  <StepRow
                    row={ROW.scrollback}
                    value={scrollback}
                    steps={scrollbackSteps}
                    warnFrom={scrollbackSteps.findIndex((s) => s.value > SCROLLBACK_WARN_THRESHOLD)}
                    onChange={setScrollback}
                    hint={scrollback > SCROLLBACK_WARN_THRESHOLD
                      ? <span className="text-[var(--ins-warn)]">Lines kept per terminal. This depth uses a lot of memory and slows resizing.</span>
                      : undefined}
                  />
                  <ToggleRow
                    row={ROW['file-watching']}
                    value={fileWatchingEnabled}
                    onChange={toggleWatchers}
                    hint={<>Refresh the files pane when files change on disk. Also <span className="text-foreground">:watch</span> in the palette.</>}
                  />
                </Section>

                <Section section={section('git')} active={activeId === 'git'}>
                  <ChoiceRow
                    row={ROW['auto-commit']}
                    value={autoCommitCli}
                    options={CLI_OPTIONS}
                    onChange={setAutoCommitCli}
                    hint={<span className="inline-flex flex-wrap items-center gap-1">Writes the message with an agent, then commits. Run it with <KeyChord keys={COMMIT_KEYS} size="sm" /></span>}
                  />
                  <Row id="commit-prompt" sectionId="git" label={ROW['commit-prompt'].label} htmlFor="settings-commit-prompt" hint="Added to the default prompt. Leave empty for the default.">
                    <DraftField
                      id="settings-commit-prompt"
                      multiline
                      value={autoCommitCustomPrompt}
                      onCommit={setAutoCommitCustomPrompt}
                      placeholder="e.g. Use imperative mood. Prefix with ticket number PROJ-123."
                    />
                  </Row>
                  <ToggleRow row={ROW.changelog} value={autoChangelogEnabled} onChange={setAutoChangelogEnabled}>
                    {autoChangelogEnabled && (
                      <SubRows className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
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
                      </SubRows>
                    )}
                  </ToggleRow>
                </Section>

                <Section section={section('budget')} active={activeId === 'budget'}>
                  <Row
                    id="budget" sectionId="budget"
                    label={ROW.budget.label}
                    hint="Daily and weekly token limits, with alerts as you near them."
                    control={<PanelButton onClick={openBudget} className="text-xs">Edit budget…</PanelButton>}
                  />
                </Section>

                <Section section={section('sandbox')} active={activeId === 'sandbox'}>
                  <ToggleRow row={ROW.sandbox} value={sandboxEnabled} onChange={toggleSandbox}>
                    {sandboxEnabled && sandboxFailed && (
                      <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--ins-fault)]">
                        <Lamp state="fault" /> The sandbox failed to start in this tab.
                      </div>
                    )}
                    {/* Figures: full draws FIG.10 from the live spec while the
                        sandbox is on; the list is its fallback and what shows
                        while it is off. */}
                    {sandboxEnabled ? (
                      <Fig10Sandbox
                        projectPath={projectPath}
                        networkIsolation={networkIsolation}
                        fallback={<SandboxSpecList />}
                      />
                    ) : <SandboxSpecList />}
                  </ToggleRow>
                  <ToggleRow
                    row={ROW.network}
                    value={networkIsolation}
                    onChange={toggleNetwork}
                    disabled={!sandboxEnabled}
                    tone="warn"
                    hint={sandboxEnabled
                      ? 'Cut the sandboxed terminal off from the network. Restarts the terminal.'
                      : 'Needs the sandbox on.'}
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

// The contexts sent with a task to plan it; edited in their own dialog.
function PlanContextsRow() {
  const { contexts, defaultId } = usePlanContexts();
  const [open, setOpen] = useState(false);
  const def = contexts.find((c) => c.id === defaultId);
  return (
    <Row
      id="plan-contexts"
      sectionId="agent"
      label={ROW['plan-contexts'].label}
      hint={<>Sent ahead of a task when you plan it from the tasks pane. Default: <span className="text-foreground">{def?.name}</span>.</>}
      control={<PanelButton onClick={() => setOpen(true)} className="text-xs">edit {contexts.length}</PanelButton>}
    >
      {open && (
        <Suspense fallback={null}>
          <PlanContextsDialog open onOpenChange={setOpen} />
        </Suspense>
      )}
    </Row>
  );
}

// The command a tab starts Claude Code with, and what Lirah would run now
// when it's left empty (claude, or npx when claude isn't on PATH).
function ClaudeCommandRow() {
  const [claudeCommand, setClaudeCommand] = useSetting('claudeCommand');
  const custom = claudeCommand.trim();
  const [found, setFound] = useState(null); // is `claude` on PATH; null while checking
  useEffect(() => {
    if (custom) return;
    let live = true;
    invoke('check_command_exists', { command: CLI_COMMANDS['claude-code'].check })
      .then((ok) => live && setFound(ok), () => live && setFound(false));
    return () => { live = false; };
  }, [custom]);
  const cfg = CLI_COMMANDS['claude-code'];
  const now = custom || (found == null ? null : found ? cfg.command : cfg.fallback);
  return (
    <Row
      id="claude-command"
      sectionId="agent"
      label={ROW['claude-command'].label}
      htmlFor="settings-claude-command"
      hint={(
        <>
          How a tab starts Claude Code; Lirah adds its plugin flags after it. Applies to agents launched after the
          change. Leave empty to use claude, or npx when claude isn&apos;t found.
          <span className="mt-1 block">
            Now: {now ? <code className="text-foreground">{now}</code> : 'checking…'}
            {!custom && found === false && ' (claude was not found on PATH)'}
          </span>
        </>
      )}
    >
      <DraftField
        id="settings-claude-command"
        value={claudeCommand}
        onCommit={setClaudeCommand}
        placeholder="claude"
        spellCheck={false}
      />
    </Row>
  );
}
