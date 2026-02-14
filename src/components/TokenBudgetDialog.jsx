import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useTokenBudget } from '../contexts/TokenBudgetContext';

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

  const usagePercent = (limit) => {
    if (!limit) return 0;
    return Math.min((currentUsage.total / parseInt(limit)) * 100, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Token Budget Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground font-mono truncate">
            {projectPath || 'No project'}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Daily Limit (tokens)</label>
            <Input
              type="number"
              placeholder="e.g. 100000"
              value={dailyLimit}
              onChange={(e) => { setDailyLimit(e.target.value); setError(''); }}
              min={1000}
              max={10000000}
              className="text-xs"
            />
            {dailyLimit && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${usagePercent(dailyLimit)}%`,
                      backgroundColor: usagePercent(dailyLimit) >= 95 ? '#E82424' : usagePercent(dailyLimit) >= 80 ? '#FF9E3B' : '#76946A',
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {currentUsage.total.toLocaleString()} / {parseInt(dailyLimit).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Weekly Limit (tokens)</label>
            <Input
              type="number"
              placeholder="e.g. 500000"
              value={weeklyLimit}
              onChange={(e) => { setWeeklyLimit(e.target.value); setError(''); }}
              min={1000}
              max={10000000}
              className="text-xs"
            />
            {weeklyLimit && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${usagePercent(weeklyLimit)}%`,
                      backgroundColor: usagePercent(weeklyLimit) >= 95 ? '#E82424' : usagePercent(weeklyLimit) >= 80 ? '#FF9E3B' : '#76946A',
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {currentUsage.total.toLocaleString()} / {parseInt(weeklyLimit).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Current session: {currentUsage.total.toLocaleString()} tokens ({currentUsage.cost < 0.01 ? '<$0.01' : `$${currentUsage.cost.toFixed(2)}`})
          </div>

          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="mr-auto text-xs">
            Reset Alerts
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="text-xs">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
