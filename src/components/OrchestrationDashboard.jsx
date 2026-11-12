import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogGroup,
  DialogEmpty,
  DialogRow,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Scanner } from '@/components/instrument/Scanner';
import { Done, Download, Failed, Warning } from '@/components/icons';
import { useToast } from '@/features/toast';

const STATUS_ICON = {
  installed: <Done size={14} style={{ color: 'var(--color-status-success)' }} />,
  current: <Done size={14} style={{ color: 'var(--color-status-success)' }} />,
  outdated: <Warning size={14} style={{ color: 'var(--color-status-warning)' }} />,
  missing: <Failed size={14} style={{ color: 'var(--color-status-critical)' }} />,
  updated: <Done size={14} style={{ color: 'var(--color-status-info)' }} />,
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
    <Badge variant={config.variant} className="text-[11px] px-1.5 py-0">
      {config.label}
    </Badge>
  );
}

// A group: legend and hairline, then DialogRows bleeding into the gutter.
function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-1">
      <DialogGroup label={title} />
      <div className="-mx-3">
        {children}
      </div>
    </div>
  );
}

function RowName({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      {icon}
      {label}
    </span>
  );
}

function StatusRow({ label, status }) {
  return (
    <DialogRow
      name={<RowName icon={STATUS_ICON[status]} label={label} />}
      actions={<StatusBadge status={status} />}
    />
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
    <DialogRow
      name={<RowName icon={workflow.localInstalled ? STATUS_ICON.installed : STATUS_ICON.missing} label={workflow.label} />}
      preview={workflow.path}
      actions={workflow.cdnAvailable && !workflow.localInstalled ? (
        <Button
          variant="ghost"
          size="panel"
          onClick={handleInstall}
          busy={installing}
        >
          {!installing && <Download size={10} />}
          Install
        </Button>
      ) : (
        <StatusBadge status={workflow.localInstalled ? 'installed' : 'missing'} />
      )}
    />
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
    if (open) refreshStatus();
  }, [open, refreshStatus]);

  const isConfigured = orchStatus && orchStatus.protocol !== 'missing';
  // protocol + scripts + workflows + the three hooks
  const itemCount = isConfigured
    ? 1 + Object.keys(orchStatus.scripts).length + (availableWorkflows?.length ?? 0) + (hooksStatus ? 3 : 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-h-[80vh] overflow-y-auto"
        status={loading ? 'refreshing' : isConfigured ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : undefined}
        escLabel="done"
      >
        <DialogTitle>Orchestration</DialogTitle>
        <DialogDescription>Protocol, scripts, workflows and hooks for this project.</DialogDescription>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Scanner size="md" />
            <span className="text-xs opacity-60">Loading status...</span>
          </div>
        ) : !isConfigured ? (
          <DialogEmpty>
            Not set up here: no <code>.orchestration/</code> folder in <code>{projectPath}</code>.
          </DialogEmpty>
        ) : (
          <div className="space-y-4">
            {/* Protocol Status */}
            <Section title="Protocol">
              <StatusRow label="orchestration.md" status={orchStatus.protocol} />
            </Section>

            {/* Tool Scripts */}
            <Section title="Tool Scripts">
              {Object.entries(orchStatus.scripts).map(([name, status]) => (
                <StatusRow key={name} label={name} status={status} />
              ))}
              {Object.keys(orchStatus.scripts).length === 0 && (
                <DialogEmpty className="px-3">No scripts found</DialogEmpty>
              )}
            </Section>

            {/* Workflows */}
            <Section title="Workflows">
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
                  <DialogEmpty className="px-3">No workflows available</DialogEmpty>
                )
              ) : (
                <div className="flex items-center gap-2 px-3.5 text-xs">
                  <Scanner />
                  <span className="opacity-40">Loading workflows...</span>
                </div>
              )}
            </Section>

            {/* Hooks Status */}
            <Section title="Global Hooks">
              {hooksStatus ? (
                <>
                  {!hooksStatus.installed && (
                    <div className="flex items-center gap-1.5 px-3.5 text-[11px] pb-1" style={{ color: 'var(--color-status-warning)' }}>
                      <Warning size={12} />
                      Hooks not installed. Install globally via the orchestration setup guide.
                    </div>
                  )}
                  <StatusRow
                    label="classify.sh (UserPromptSubmit)"
                    status={hooksStatus.hooks.classify ? 'installed' : 'missing'}
                  />
                  <StatusRow
                    label="maintain.sh (SessionStart)"
                    status={hooksStatus.hooks.maintain ? 'installed' : 'missing'}
                  />
                  <StatusRow
                    label="guard-explore.sh (PreToolUse)"
                    status={hooksStatus.hooks.guard ? 'installed' : 'missing'}
                  />
                </>
              ) : (
                <span className="px-3.5 text-xs opacity-40">Checking...</span>
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
