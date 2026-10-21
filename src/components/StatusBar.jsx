import { useState, useMemo, memo } from 'react';
import {
  Keyboard, Bot, Terminal, BarChart3, AlertCircle, Settings, GitCommitHorizontal,
  Layers, X, GitMerge
} from 'lucide-react';
import { Scanner } from './instrument/Scanner';
import { Button } from './ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut,
  DropdownMenuLabel, DropdownMenuGroup,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { useTokenBudget } from '../features/token-budget/TokenBudgetContext';
import { getContextFill, HEAVY_CONTEXT_TOKENS } from '../config/models';
import { Lamp } from './instrument/Lamp';
import { LirahMark } from './LirahMark';
import { Meter } from './instrument/Meter';
import { ToggleSwitch } from './instrument/ToggleSwitch';
import { useTabManager } from '../features/tabs/TabContext';
import { requestAttentionJump, useAttentionQueue } from '../features/tabs/useAgentAttention';

const CLI_DISPLAY = {
  'claude-code': { name: 'claude', icon: Bot },
  'opencode': { name: 'opencode', icon: Terminal }
};


function ChangelogStatus({ status }) {
  const config = useMemo(() => ({
    updating: { component: Scanner, text: 'Updating changelog...', props: {} },
    done: { lamp: 'ok', text: 'Changelog updated' },
    error: { lamp: 'fault', text: 'Changelog failed' }
  }), []);

  const { component: Component, lamp, text, props } = config[status] || {};
  if (!Component && !lamp) return null;

  return (
    <span className="flex items-center gap-1.5 px-1.5 text-xs opacity-80">
      {Component ? <Component {...props} /> : <Lamp state={lamp} />}
      <span>{text}</span>
    </span>
  );
}

function SandboxSwitch({ enabled, failed, onToggle }) {
  const tooltip = enabled && failed ? 'Sandbox: FAILED' : enabled ? 'Sandbox: ON' : 'Sandbox: OFF';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          <span className="ins-legend">Sandbox</span>
          <ToggleSwitch checked={enabled} onChange={onToggle} label="Sandbox" tone="ok" />
          {enabled && failed && <Lamp state="fault" label="Sandbox failed" />}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function NetworkSwitch({ isolated, enabled, onToggle }) {
  const tooltip = isolated && enabled ? 'Network: ISOLATED' : 'Network: ALLOWED';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 px-1">
          <span className="ins-legend">Net</span>
          <ToggleSwitch checked={isolated} onChange={onToggle} disabled={!enabled} label="Network isolation" tone="warn" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// Token gauge, centred in the top row: context-window fill (or, before context
// data arrives, the daily budget) with used / max and %. Past
// HEAVY_CONTEXT_TOKENS the fill and readout go amber; billable and cache
// figures live in the tooltip. Every slot has a fixed width and an idle
// placeholder so the gauge never shifts between tabs. Click opens the token
// dashboard.
function ContextMeter({ tokenUsage, currentPath, onOpenDashboard }) {
  const { getBudget, currentUsage, formatTokenCount } = useTokenBudget();
  const ctx = getContextFill(tokenUsage);
  const dailyLimit = getBudget(currentPath)?.dailyLimit;
  const fmt = (n) => (formatTokenCount ? formatTokenCount(n) : String(n));
  const num = (n) => n.toLocaleString();

  const billableIn = tokenUsage?.billable_input_tokens || 0;
  const billableOut = tokenUsage?.billable_output_tokens || 0;
  const billable = billableIn + billableOut;
  const cacheRead = tokenUsage?.cache_read_input_tokens || 0;
  const cacheHit = cacheRead ? Math.round((cacheRead / (cacheRead + billableIn)) * 100) : null;

  let legend = 'Ctx', value = 0, max = 0;
  if (ctx) {
    value = ctx.used; max = ctx.max;
  } else if (dailyLimit) {
    legend = 'Budget'; value = currentUsage.total; max = dailyLimit;
  }
  const pct = max ? Math.round((value / max) * 100) : null;
  const heavy = !!ctx && ctx.used > HEAVY_CONTEXT_TOKENS;
  // Mirrors Meter's thresholds: the readout only lights once it means something.
  const tone = pct >= 95 ? 'tube tube-overflow' : pct >= 80 || heavy ? 'text-[var(--ins-warn)]' : 'text-foreground';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role={onOpenDashboard ? 'button' : undefined}
          tabIndex={onOpenDashboard ? 0 : undefined}
          onClick={onOpenDashboard}
          onKeyDown={(e) => {
            if (onOpenDashboard && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenDashboard(); }
          }}
          className={cn('flex items-center gap-2 px-1 focus-ring', onOpenDashboard ? 'cursor-pointer' : 'cursor-default')}
        >
          <span className="ins-legend shrink-0">{legend}</span>
          <Meter
            value={value}
            max={max || 1}
            size="lg"
            readout={false}
            caution={heavy}
            label={legend === 'Ctx' ? 'Context window' : 'Daily budget'}
            className={max ? undefined : 'opacity-40'}
          />
          {/* One figure: the fill already reads as a share; % is in the tooltip. */}
          <span className={cn('flex items-baseline tabular-nums', pct == null ? 'tube-idle' : tone)}>
            <span className="w-[6ch] text-right">{max ? fmt(value) : '--'}</span>
            <span className="px-0.5 opacity-50">/</span>
            <span className="w-[5ch]">{max ? fmt(max) : '--'}</span>
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="grid grid-cols-[auto_auto_auto] gap-x-3 font-mono tabular-nums">
          {ctx && (
            <>
              <span>context</span>
              <span className="text-right">{num(ctx.used)} / {num(ctx.max)}</span>
              <span className="text-right">{pct}%</span>
              {heavy && <span className="col-span-3 text-[var(--ins-warn)]">over {num(HEAVY_CONTEXT_TOKENS)} tokens: consider clearing</span>}
            </>
          )}
          {dailyLimit ? (
            <>
              <span>daily budget</span>
              <span className="text-right">{num(currentUsage.total)} / {num(dailyLimit)}</span>
              <span className="text-right">{Math.round((currentUsage.total / dailyLimit) * 100)}%</span>
            </>
          ) : null}
          {billable > 0 && (
            <>
              <span>billable</span>
              <span className="text-right">{num(billable)}</span>
              <span />
              <span className="pl-2 opacity-70">├ in</span>
              <span className="text-right opacity-70">{num(billableIn)}</span>
              <span />
              <span className="pl-2 opacity-70">└ out</span>
              <span className="text-right opacity-70">{num(billableOut)}</span>
              <span />
            </>
          )}
          {cacheRead ? (
            <>
              <span>cache read</span>
              <span className="text-right">{num(cacheRead)}</span>
              <span className="text-right">{cacheHit}% hit</span>
              <span className="col-span-3 opacity-70">cache reads bill at ≈0.1× input</span>
            </>
          ) : null}
          {onOpenDashboard && <span className="col-span-3 mt-1 opacity-70">click for token metrics</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ConfirmToggleDialog({ open, onOpenChange, title, description, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] border-destructive/30 edge-engraved bg-destructive/5">
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-base font-semibold">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="edge-engraved">
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Agents in other tabs waiting on you. Click (or Alt+A) jumps to the next one.
function AttentionIndicator() {
  const { tabs } = useTabManager();
  const queue = useAttentionQueue(tabs);
  if (queue.length === 0) return null;
  const blocked = queue.filter((q) => q.state === 'permission').length;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={requestAttentionJump}
          className="gap-1.5 px-1 h-5 before:content-none after:content-none"
        >
          <Lamp state={blocked ? 'fault' : 'warn'} blink={blocked > 0} />
          <span className="text-muted-foreground">[{queue.length} waiting]</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {blocked ? `${blocked} blocked on permission · ` : ''}Jump to the next one (Alt+A)
      </TooltipContent>
    </Tooltip>
  );
}

// Memoized: StatusBar's props are all primitives/callbacks, so with stable
// callbacks (see ProjectTab call site) it skips re-render on every keystroke
// in the prompt textarea and on the 5s token/branch polls.
export const StatusBar = memo(({
  viewMode, currentPath, sessionId, onToggleHelp,
  selectedCli, onOpenCliSettings, showTitleBar,
  sandboxEnabled, sandboxFailed, networkIsolation,
  onToggleNetworkIsolation, onToggleSandbox, secondaryTerminalFocused,
  onOpenDashboard, changelogStatus, onOpenSettings, onAutoCommit, onAutoMerge,
  workspace, onOpenWorkspaceDialog, onCloseWorkspace, onClearContext,
  availableUpdate, tokenUsage
}) => {
  const [showSandboxConfirm, setShowSandboxConfirm] = useState(false);
  const [showNetworkConfirm, setShowNetworkConfirm] = useState(false);

  // File watching has no shortcut (Ctrl+W closes the tab): it's in Settings
  // and the `:watch` command. Ctrl+Shift+L lives in useTabShortcuts,
  // where only the active tab listens.

  const cliName = CLI_DISPLAY[selectedCli]?.name || selectedCli;

  const handleSandboxToggle = () => {
    if (sessionId) {
      setShowSandboxConfirm(true);
    } else {
      onToggleSandbox();
    }
  };

  const confirmSandboxToggle = () => {
    setShowSandboxConfirm(false);
    onToggleSandbox();
  };

  const handleNetworkToggle = () => {
    if (sessionId) {
      setShowNetworkConfirm(true);
    } else {
      onToggleNetworkIsolation();
    }
  };

  const confirmNetworkToggle = () => {
    setShowNetworkConfirm(false);
    onToggleNetworkIsolation();
  };

  return (
    <>
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 pl-2 pr-2 h-full text-xs font-mono text-foreground"
    >
      {/* LEFT: maker's legend, workspace + update. Project and branch live in
          the sidebar's TABS pane. The title bar carries the legend when shown. */}
      <div className="flex items-center gap-3 overflow-hidden min-w-0">
        {!showTitleBar && <LirahMark size={18} title="Lirah" className="shrink-0 ml-1" />}
        <div className="flex items-center gap-1.5 min-w-0">
          {workspace && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenWorkspaceDialog} className="gap-1.5 px-1.5 h-5 before:content-none after:content-none">
                  <span className="ins-legend">Ws</span>
                  <span className="opacity-70">{workspace.name}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Workspace: {workspace.projects.map(p => p.name).join(' + ')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <AttentionIndicator />

        {/* Context actions: update (shown when relevant) */}
        {availableUpdate && (
          <>
            <div className="flex items-center gap-0.5">
              {availableUpdate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
                          openUrl(availableUpdate.url);
                        });
                      }}
                      className="gap-1.5 px-1 h-5 before:content-none after:content-none"
                    >
                      <Lamp state="ok" />
                      <span className="text-muted-foreground">[update {availableUpdate.version}]</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Update available — click to view release</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>

      {/* CENTRE: the context gauge, alone so it reads at a glance. The side
          columns share the remaining width equally, keeping it centred. */}
      <ContextMeter tokenUsage={tokenUsage} currentPath={currentPath} onOpenDashboard={onOpenDashboard} />

      {/* RIGHT: Runtime status + Settings */}
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        {/* Transient status (changelog) — only visible when active */}
        {changelogStatus && (
          <ChangelogStatus status={changelogStatus} />
        )}

        {/* Runtime zone: CLI, sandbox, network. Jobs live
            in their own rail, so they are not repeated here. */}
        <div className="flex items-center gap-1.5">
          {selectedCli && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onOpenCliSettings} className="gap-1.5 px-1 h-5 lowercase before:content-none after:content-none">
                  <Lamp state={sessionId ? 'ok' : 'off'} />
                  {cliName}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change CLI tool (Ctrl+K)</TooltipContent>
            </Tooltip>
          )}
          <SandboxSwitch enabled={sandboxEnabled} failed={sandboxFailed} onToggle={handleSandboxToggle} />
          {sandboxEnabled && (
            <NetworkSwitch isolated={networkIsolation} enabled={sandboxEnabled} onToggle={handleNetworkToggle} />
          )}
        </div>

        {/* Settings — visually separated as the final anchor */}
        <span className="w-px h-4 bg-[var(--tui-line)] mx-1" aria-hidden="true" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="px-1.5" aria-label="Settings and actions">
                  <span className="ins-legend">Settings</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings and quick actions</TooltipContent>
          </Tooltip>
          {/* Preferences live in the Settings dialog; this menu keeps actions. */}
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuItem onClick={onOpenSettings} className="cursor-pointer py-1">
              <Settings className="mr-2 w-3 h-3" />
              Settings…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ins-legend text-[10px] font-normal">Actions</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenDashboard} className="cursor-pointer py-1">
                <BarChart3 className="mr-2 w-3 h-3" />
                Token Metrics
                <DropdownMenuShortcut>Ctrl+Shift+D</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAutoCommit} className="cursor-pointer py-1">
                <GitCommitHorizontal className="mr-2 w-3 h-3" />
                Auto Commit…
                <DropdownMenuShortcut>Ctrl+Shift+Space</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAutoMerge} className="cursor-pointer py-1">
                <GitMerge className="mr-2 w-3 h-3" />
                Auto Merge…
                <DropdownMenuShortcut>Alt+M</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleHelp} className="cursor-pointer py-1">
                <Keyboard className="mr-2 w-3 h-3" />
                Keyboard Shortcuts
                <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="ins-legend text-[10px] font-normal">Workspaces</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenWorkspaceDialog} className="cursor-pointer py-1">
                <Layers className="mr-2 w-3 h-3" />
                {workspace ? `Workspace: ${workspace.name}` : 'Workspaces…'}
              </DropdownMenuItem>
              {workspace && (
                <DropdownMenuItem onClick={onCloseWorkspace} className="cursor-pointer py-1">
                  <X className="mr-2 w-3 h-3" />
                  Close Workspace
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <ConfirmToggleDialog
      open={showSandboxConfirm}
      onOpenChange={setShowSandboxConfirm}
      title="Toggle Sandbox Mode?"
      description={<>This will <span className="font-medium text-destructive">reset and restart</span> your terminal session. Any running processes will be terminated and file system isolation will be {sandboxEnabled ? 'disabled' : 'enabled'}.</>}
      onConfirm={confirmSandboxToggle}
    />

    <ConfirmToggleDialog
      open={showNetworkConfirm}
      onOpenChange={setShowNetworkConfirm}
      title="Toggle Network Isolation?"
      description={<>This will <span className="font-medium text-destructive">reset and restart</span> your terminal session. Any running processes will be terminated and external network access will be {networkIsolation ? 'restored' : 'blocked'}.</>}
      onConfirm={confirmNetworkToggle}
    />
  </>
  );
});

