import React from 'react';
import { X } from 'lucide-react';
import { useTokenBudget } from '../contexts/TokenBudgetContext';

export function TokenAlertBanner({ projectPath, onOpenBudgetSettings }) {
  const { checkBudgetStatus, shouldShowAlert, dismissAlert } = useTokenBudget();

  if (!projectPath) return null;

  const { status, percentage } = checkBudgetStatus(projectPath);

  if (status === 'critical' && shouldShowAlert(projectPath, 'daily95')) {
    return (
      <div
        className="fixed left-0 right-0 z-50 flex items-center justify-between px-4 py-2 border-b text-xs cursor-pointer"
        style={{ top: '32px', backgroundColor: 'rgba(232, 36, 36, 0.15)', borderColor: '#E82424', color: '#E82424' }}
        onClick={onOpenBudgetSettings}
      >
        <span>Daily token budget nearly exhausted ({Math.round(percentage)}%)! Sending paused. Click to adjust settings.</span>
        <button
          onClick={(e) => { e.stopPropagation(); dismissAlert(projectPath, 'daily95'); }}
          className="p-0.5 hover:opacity-70"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (status === 'warning' && shouldShowAlert(projectPath, 'daily80')) {
    return (
      <div
        className="fixed left-0 right-0 z-50 flex items-center justify-between px-4 py-2 border-b text-xs cursor-pointer"
        style={{ top: '32px', backgroundColor: 'rgba(255, 158, 59, 0.15)', borderColor: '#FF9E3B', color: '#FF9E3B' }}
        onClick={onOpenBudgetSettings}
      >
        <span>Approaching daily token budget ({Math.round(percentage)}%) - Click to adjust</span>
        <button
          onClick={(e) => { e.stopPropagation(); dismissAlert(projectPath, 'daily80'); }}
          className="p-0.5 hover:opacity-70"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
