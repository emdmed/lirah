import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Meter } from '@/components/instrument/Meter';
import { WARN_AT, FAULT_AT } from '@/components/instrument/gauge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTokenBudget } from './TokenBudgetContext';

export function TokenBudgetDialog({ open, onOpenChange, projectPath }) {
  const { getBudget, setBudget, removeBudget, currentUsage, resetAlerts } = useTokenBudget();

  const [dailyLimit, setDailyLimit] = useState('');
  const [weeklyLimit, setWeeklyLimit] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && projectPath) {
      const budget = getBudget(projectPath);
      setDailyLimit(budget?.dailyLimit?.toString() || '');
      setWeeklyLimit(budget?.weeklyLimit?.toString() || '');
      setError('');
    }
  }, [open, projectPath, getBudget]);

  const validate = () => {
    const daily = parseInt(dailyLimit);
    const weekly = parseInt(weeklyLimit);

    if (dailyLimit && (isNaN(daily) || daily < 1000)) {
      return 'Daily limit must be at least 1,000 tokens';
    }
    if (weeklyLimit && (isNaN(weekly) || weekly < 1000)) {
      return 'Weekly limit must be at least 1,000 tokens';
    }
    if (daily > 10_000_000 || weekly > 10_000_000) {
      return 'Limits cannot exceed 10,000,000 tokens';
    }
    if (dailyLimit && weeklyLimit && daily >= weekly) {
      return 'Daily limit must be less than weekly limit';
    }
    return '';
  };

  const handleSave = () => {
    const err = validate();
    if (err) { setError(err); return; }

    const daily = dailyLimit ? parseInt(dailyLimit) : null;
    const weekly = weeklyLimit ? parseInt(weeklyLimit) : null;

    if (!daily && !weekly) {
      removeBudget(projectPath);
    } else {
      setBudget(projectPath, daily, weekly);
    }
    onOpenChange(false);
  };

  const handleReset = () => {
    resetAlerts(projectPath);
  };

  const cost = currentUsage.cost < 0.01 ? '<$0.01' : `$${currentUsage.cost.toFixed(2)}`;

  const limitField = (id, label, value, setValue, placeholder) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="ins-legend">{label}</label>
      <Input
        id={id}
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(''); }}
        min={1000}
        max={10000000}
        className="text-xs tabular-nums"
      />
      {value && parseInt(value) > 0 && (
        <Meter value={currentUsage.total} max={parseInt(value)} label={`${label} used`} />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        keys={['^', '⇧', 'B']}
        escLabel="cancel"
        status={<span className="tabular-nums">{currentUsage.total.toLocaleString()} tokens · {cost}</span>}
      >
        <DialogHeader>
          <DialogTitle>Token budget</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs" title={projectPath || undefined}>
            {projectPath || 'No project'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {limitField('budget-daily', 'Daily limit', dailyLimit, setDailyLimit, 'e.g. 100000')}
          {limitField('budget-weekly', 'Weekly limit', weeklyLimit, setWeeklyLimit, 'e.g. 500000')}
          <p className="text-xs text-muted-foreground">
            Leave both empty to remove the budget. Alerts show at {WARN_AT * 100}% and {FAULT_AT * 100}%.
          </p>
          {error && <p className="text-xs text-[var(--ins-fault)]" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleReset} className="sm:mr-auto">
            Reset alerts
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
