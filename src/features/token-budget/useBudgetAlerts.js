import { useEffect } from 'react';
import { useToast } from '../toast';
import { useTokenBudget } from './TokenBudgetContext';

// Budget alerts go to the message line: one toast per level per project,
// fired by the active tab only, held until dismissed. Dismissing (or
// following the `budget` action) silences that level for today.
const LEVELS = {
  warning: { alert: 'daily80', type: 'warning', message: (p) => `Daily token budget at ${p}%` },
  critical: { alert: 'daily95', type: 'error', message: (p) => `Daily token budget at ${p}%. Sending is paused` },
};

export function useBudgetAlerts({ projectPath, isActive, onOpenBudget }) {
  const { checkBudgetStatus, shouldShowAlert, dismissAlert } = useTokenBudget();
  const toast = useToast();

  const { status, percentage } = projectPath ? checkBudgetStatus(projectPath) : {};
  const level = LEVELS[status];
  const show = !!(isActive && level && shouldShowAlert(projectPath, level.alert));

  useEffect(() => {
    if (!show) return;
    toast.toast(level.message(Math.round(percentage)), {
      type: level.type,
      duration: 0,
      dedupeKey: `budget:${projectPath}:${level.alert}`,
      action: { label: 'budget', onClick: onOpenBudget },
      onDismiss: () => dismissAlert(projectPath, level.alert),
    });
    // Fire once when the level is reached; dedupeKey covers re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, level, projectPath]);
}

// Renders nothing; lets a tab run the hook inside its TokenBudgetProvider.
export function BudgetAlerts(props) {
  useBudgetAlerts(props);
  return null;
}
