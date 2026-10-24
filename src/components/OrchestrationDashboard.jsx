import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogGroup,
  DialogEmpty,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Scanner } from '@/components/instrument/Scanner';
import {
  CheckCircle2, AlertTriangle, XCircle, Download,
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
    <Badge variant={config.variant} className="text-[11px] px-1.5 py-0">
      {config.label}
    </Badge>
  );
}

// A group: legend and hairline, then bare rows (one frame per pane).
function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <DialogGroup label={title} />
      <div className="space-y-1.5 text-xs">
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
        <span className="text-[11px] opacity-30 font-mono">{workflow.path}</span>
      </div>
      {workflow.cdnAvailable && !workflow.localInstalled ? (
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-1.5 text-[11px] gap-1"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? <Scanner /> : <Download className="w-2.5 h-2.5" />}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-h-[80vh] overflow-y-auto"
      >
        <DialogTitle>Orchestration</DialogTitle>
        <DialogDescription className="sr-only">Protocol, scripts, workflows, hooks and patterns for this project.</DialogDescription>

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
                <span className="opacity-40">No scripts found</span>
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
                  <span className="opacity-40">No workflows available</span>
                )
              ) : (
                <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-1.5 text-[11px] pb-1" style={{ color: 'var(--color-status-warning)' }}>
                      <AlertTriangle className="w-3 h-3" />
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
                <span className="opacity-40">Checking...</span>
              )}
            </Section>

            {/* Patterns */}
            <Section title="Patterns">
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
