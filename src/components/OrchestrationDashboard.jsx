import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RetroSpinner } from '@/components/ui/RetroSpinner';
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download,
  FileText, Code, GitBranch, Shield, Puzzle
} from 'lucide-react';
import { useToast } from '@/features/toast';

const STATUS_ICON = {
  installed: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-status-success)' }} />,
  current: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-status-success)' }} />,
  outdated: <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--color-status-warning)' }} />,
  missing: <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--color-status-critical)' }} />,
  updated: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-status-info)' }} />,
};

const STATUS_BADGE = {
  installed: { label: 'Installed', variant: 'secondary' },
  current: { label: 'Up to date', variant: 'secondary' },
  outdated: { label: 'Outdated', variant: 'outline' },
  missing: { label: 'Missing', variant: 'destructive' },
  updated: { label: 'Updated', variant: 'secondary' },
};

function StatusBadge({ status }) {
  const config = STATUS_BADGE[status] || { label: status, variant: 'outline' };
  return (
    <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
      {config.label}
    </Badge>
  );
}

function Section({ icon: Icon, title, children, action }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 opacity-70" />
          {title}
        </div>
        {action}
      </div>
      <div className="rounded-none border border-sketch bg-secondary/20 p-3 space-y-1.5 text-xs">
        {children}
      </div>
    </div>
  );
}

function StatusRow({ label, status, icon }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-2">
        {icon || STATUS_ICON[status]}
        <span className="opacity-80">{label}</span>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function WorkflowRow({ workflow, projectPath, orchestrationCheck, onRefresh, toast }) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const result = await orchestrationCheck.installWorkflow(projectPath, workflow.path);
      if (result.success) {
        toast.success(`Installed ${workflow.label}`);
        onRefresh();
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch {
      toast.error('Install failed');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-2">
        {workflow.localInstalled ? STATUS_ICON.installed : STATUS_ICON.missing}
        <span className="opacity-80">{workflow.label}</span>
        <span className="text-[9px] opacity-30 font-mono">{workflow.path}</span>
      </div>
      {workflow.cdnAvailable && !workflow.localInstalled ? (
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-1.5 text-[10px] gap-1"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? <RetroSpinner size={8} lineWidth={1} /> : <Download className="w-2.5 h-2.5" />}
          Install
        </Button>
      ) : (
        <StatusBadge status={workflow.localInstalled ? 'installed' : (workflow.cdnAvailable ? 'missing' : 'missing')} />
      )}
    </div>
  );
}

export function OrchestrationDashboard({
  open,
  onOpenChange,
  projectPath,
  orchestrationCheck,
}) {
  const [orchStatus, setOrchStatus] = useState(null);
  const [hooksStatus, setHooksStatus] = useState(null);
  const [availableWorkflows, setAvailableWorkflows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [installingHooks, setInstallingHooks] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const toast = useToast();

  const refreshStatus = useCallback(async () => {
    if (!projectPath || !orchestrationCheck) return;
    setLoading(true);
    try {
      const [orch, hooks, workflows] = await Promise.all([
        orchestrationCheck.getOrchestrationStatus(projectPath),
        orchestrationCheck.checkHooksInstalled(),
        orchestrationCheck.getAvailableWorkflows(projectPath),
      ]);
      setOrchStatus(orch);
      setHooksStatus(hooks);
      setAvailableWorkflows(workflows);
    } catch (e) {
      console.error('Failed to load orchestration status:', e);
    } finally {
      setLoading(false);
    }
  }, [projectPath, orchestrationCheck]);

  useEffect(() => {
    if (open) {
      setSyncResult(null);
      refreshStatus();
    }
  }, [open, refreshStatus]);

  const handleSyncAll = useCallback(async () => {
    if (!projectPath) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await orchestrationCheck.fullSync(projectPath);
      setSyncResult(result);
      await refreshStatus();
      if (result) {
        const updates = [];
        if (result.orchestration === 'updated') updates.push('protocol');
        if (result.scripts.length > 0) updates.push(`${result.scripts.length} script(s)`);
        if (result.workflows.length > 0) updates.push(`${result.workflows.length} workflow(s)`);
        if (updates.length > 0) {
          toast.success(`Synced: ${updates.join(', ')}`);
        } else {
          toast.info('Everything up to date');
        }
      }
    } catch (e) {
      console.error('Sync failed:', e);
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [projectPath, orchestrationCheck, refreshStatus]);

  const handleInstallHooks = useCallback(async () => {
    setInstallingHooks(true);
    try {
      const result = await orchestrationCheck.installHooks();
      await refreshStatus();
      if (result.success) {
        toast.success('Hooks installed successfully');
      } else {
        toast.error(`Hook install failed: ${result.error}`);
      }
    } catch (e) {
      console.error('Hook install failed:', e);
      toast.error('Hook install failed');
    } finally {
      setInstallingHooks(false);
    }
  }, [orchestrationCheck, refreshStatus]);

  const isConfigured = orchStatus && orchStatus.protocol !== 'missing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Puzzle className="w-4 h-4" />
            Orchestration
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <RetroSpinner size={16} lineWidth={2} />
            <span className="text-xs opacity-60">Loading status...</span>
          </div>
        ) : !isConfigured ? (
          <div className="py-6 text-center space-y-3">
            <XCircle className="w-8 h-8 mx-auto opacity-30" />
            <p className="text-sm opacity-60">
              Orchestration is not configured for this project.
            </p>
            <p className="text-xs opacity-40">
              No <code>.orchestration/</code> directory found at <code>{projectPath}</code>
            </p>
            <Button size="sm" variant="outline" onClick={handleSyncAll} disabled={syncing}>
              {syncing ? <RetroSpinner size={12} lineWidth={1.5} /> : <Download className="w-3 h-3 mr-1.5" />}
              Initialize Orchestration
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sync All button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncResult && (
                  <span className="text-[10px] opacity-50">
                    {syncResult.orchestration === 'updated' ? 'Protocol updated. ' : ''}
                    {syncResult.scripts.length > 0 ? `${syncResult.scripts.length} script(s) updated. ` : ''}
                    {syncResult.workflows.length > 0 ? `${syncResult.workflows.length} workflow(s) updated. ` : ''}
                    {syncResult.orchestration === 'current' && syncResult.scripts.length === 0 && syncResult.workflows.length === 0
                      ? 'Everything up to date.'
                      : ''}
                  </span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={handleSyncAll} disabled={syncing} className="gap-1.5 h-7 text-xs">
                {syncing ? <RetroSpinner size={12} lineWidth={1.5} /> : <RefreshCw className="w-3 h-3" />}
                Sync All
              </Button>
            </div>

            {/* Protocol Status */}
            <Section icon={FileText} title="Protocol">
              <StatusRow label="orchestration.md" status={orchStatus.protocol} />
            </Section>

            {/* Tool Scripts */}
            <Section icon={Code} title="Tool Scripts">
              {Object.entries(orchStatus.scripts).map(([name, status]) => (
                <StatusRow key={name} label={name} status={status} />
              ))}
              {Object.keys(orchStatus.scripts).length === 0 && (
                <span className="opacity-40">No scripts found</span>
              )}
            </Section>

            {/* Workflows */}
            <Section icon={GitBranch} title="Workflows">
              {availableWorkflows ? (
                availableWorkflows.length > 0 ? (
                  availableWorkflows.map(wf => (
                    <WorkflowRow
                      key={wf.path}
                      workflow={wf}
                      projectPath={projectPath}
                      orchestrationCheck={orchestrationCheck}
                      onRefresh={refreshStatus}
                      toast={toast}
                    />
                  ))
                ) : (
                  <span className="opacity-40">No workflows available</span>
                )
              ) : (
                <div className="flex items-center gap-2">
                  <RetroSpinner size={10} lineWidth={1} />
                  <span className="opacity-40">Loading workflows...</span>
                </div>
              )}
            </Section>

            {/* Hooks Status */}
            <Section
              icon={Shield}
              title="Global Hooks"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInstallHooks}
                  disabled={installingHooks}
                  className="gap-1.5 h-6 text-[10px] px-2"
                >
                  {installingHooks ? (
                    <RetroSpinner size={10} lineWidth={1.5} />
                  ) : hooksStatus?.installed ? (
                    <RefreshCw className="w-3 h-3" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  {hooksStatus?.outdated ? 'Update' : hooksStatus?.installed ? 'Reinstall' : 'Install Hooks'}
                </Button>
              }
            >
              {hooksStatus ? (
                <>
                  {hooksStatus.outdated && (
                    <div className="flex items-center gap-1.5 text-[10px] pb-1" style={{ color: 'var(--color-status-warning)' }}>
                      <AlertTriangle className="w-3 h-3" />
                      Hook scripts have a newer version available
                    </div>
                  )}
                  <StatusRow
                    label="classify.sh (UserPromptSubmit)"
                    status={hooksStatus.hooks.classify ? (hooksStatus.outdated ? 'outdated' : 'installed') : 'missing'}
                  />
                  <StatusRow
                    label="maintain.sh (SessionStart)"
                    status={hooksStatus.hooks.maintain ? (hooksStatus.outdated ? 'outdated' : 'installed') : 'missing'}
                  />
                  <StatusRow
                    label="guard-explore.sh (PreToolUse)"
                    status={hooksStatus.hooks.guard ? (hooksStatus.outdated ? 'outdated' : 'installed') : 'missing'}
                  />
                </>
              ) : (
                <span className="opacity-40">Checking...</span>
              )}
            </Section>

            {/* Patterns */}
            <Section icon={Puzzle} title="Patterns">
              <StatusRow
                label=".patterns/patterns.md"
                status={orchStatus.patterns ? 'installed' : 'missing'}
              />
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
