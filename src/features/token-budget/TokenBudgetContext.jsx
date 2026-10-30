import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, useSyncExternalStore } from 'react';
import { useTokenUsageValue } from './tokenUsageStore';
import { getStartOfDay, getStartOfWeek, formatTokenCount, formatCost, computeCostFromUsage } from './tokenCalculations';
import { prepareChartData, prepareModelBreakdown, calculateEfficiencyMetrics } from './dashboardData';
import { exportToCSV, exportToJSON } from './exportData';
import { DEFAULT_MODEL } from '../../config/pricing';
import { loadJson, saveJson } from '../../lib/storage';
import { WARN_AT, FAULT_AT } from '../../components/instrument/gauge';

const STORAGE_KEY = 'lirah:token-budgets:v1';

const TokenBudgetContext = createContext(null);

function loadFromStorage() {
  const data = loadJson(STORAGE_KEY, null);
  return data?.version === 1 ? data : { version: 1, budgets: {}, alertStates: {} };
}

function saveToStorage(data) {
  saveJson(STORAGE_KEY, data);
}

const NO_USAGE = { total: 0, cost: 0 };

function tokenTotal(tokenUsage) {
  return tokenUsage ? (tokenUsage.billable_input_tokens || 0) + (tokenUsage.billable_output_tokens || 0) : 0;
}

function usageSummary(tokenUsage) {
  if (!tokenUsage) return NO_USAGE;
  const total = tokenTotal(tokenUsage);
  const cost = computeCostFromUsage(tokenUsage, tokenUsage.model || DEFAULT_MODEL);
  return { total, cost, model: tokenUsage.model };
}

function budgetStatus(budgets, path, total) {
  const limit = budgets[path]?.dailyLimit;
  if (!limit) return { status: 'none', percentage: 0 };
  const percentage = Math.min((total / limit) * 100, 100);
  if (percentage >= FAULT_AT * 100) return { status: 'critical', percentage };
  if (percentage >= WARN_AT * 100) return { status: 'warning', percentage };
  return { status: 'ok', percentage };
}

// The context value holds no live usage: it only changes when budgets, alerts
// or project stats do. Live usage comes from `tokenUsageStore` (see
// tokenUsageStore.js), subscribed to by useTokenBudget / useBudgetExhausted,
// so a usage poll re-renders those readers and nothing else.
export function TokenBudgetProvider({ children, tokenUsageStore, projectStats, projectPath }) {
  const [storageData, setStorageData] = useState(loadFromStorage);
  const saveTimeoutRef = useRef(null);

  const debouncedSave = useCallback((data) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToStorage(data), 300);
  }, []);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const getBudget = useCallback((path) => {
    return storageData.budgets[path] || null;
  }, [storageData.budgets]);

  const setBudget = useCallback((path, dailyLimit, weeklyLimit) => {
    setStorageData(prev => {
      const next = {
        ...prev,
        budgets: {
          ...prev.budgets,
          [path]: {
            dailyLimit,
            weeklyLimit,
            createdAt: prev.budgets[path]?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const removeBudget = useCallback((path) => {
    setStorageData(prev => {
      const next = { ...prev, budgets: { ...prev.budgets }, alertStates: { ...prev.alertStates } };
      delete next.budgets[path];
      delete next.alertStates[path];
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const getAlertState = useCallback((path) => {
    return storageData.alertStates[path] || {};
  }, [storageData.alertStates]);

  const dismissAlert = useCallback((path, alertType) => {
    const today = new Date().toISOString().split('T')[0];
    setStorageData(prev => {
      const next = {
        ...prev,
        alertStates: {
          ...prev.alertStates,
          [path]: { ...prev.alertStates[path], [alertType]: today },
        },
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const resetAlerts = useCallback((path) => {
    setStorageData(prev => {
      const next = {
        ...prev,
        alertStates: { ...prev.alertStates, [path]: {} },
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const shouldShowAlert = useCallback((path, alertType) => {
    const today = new Date().toISOString().split('T')[0];
    const dismissed = storageData.alertStates[path]?.[alertType];
    return dismissed !== today;
  }, [storageData.alertStates]);

  const statsCache = useMemo(() => {
    if (!projectStats) return { dailyActivity: [] };
    return {
      dailyActivity: projectStats.daily_activity || [],
    };
  }, [projectStats]);

  const getHistoricalData = useCallback((timeRange = 'daily') => {
    return prepareChartData(statsCache, timeRange);
  }, [statsCache]);

  const getModelBreakdown = useCallback(() => {
    if (!projectStats || !projectStats.models) return [];
    return prepareModelBreakdown(statsCache);
  }, [statsCache, projectStats]);

  const getEfficiencyMetrics = useCallback((usage = null) => {
    return calculateEfficiencyMetrics(statsCache, usage);
  }, [statsCache]);

  const exportData = useCallback((format, data, timeRange, metadata = {}) => {
    if (format === 'csv') {
      exportToCSV(data, timeRange);
    } else if (format === 'json') {
      exportToJSON(data, timeRange, metadata);
    }
  }, []);

  const value = useMemo(() => ({
    tokenUsageStore,
    budgets: storageData.budgets,
    getBudget,
    setBudget,
    removeBudget,
    getAlertState,
    dismissAlert,
    resetAlerts,
    shouldShowAlert,
    formatTokenCount,
    formatCost,
    getHistoricalData,
    getModelBreakdown,
    getEfficiencyMetrics,
    exportData,
    projectStats,
  }), [tokenUsageStore, storageData.budgets, getBudget, setBudget, removeBudget, getAlertState, dismissAlert, resetAlerts, shouldShowAlert, getHistoricalData, getModelBreakdown, getEfficiencyMetrics, exportData, projectStats]);

  return (
    <TokenBudgetContext.Provider value={value}>
      {children}
    </TokenBudgetContext.Provider>
  );
}

function useTokenBudgetContext() {
  const ctx = useContext(TokenBudgetContext);
  if (!ctx) throw new Error('useTokenBudget must be used within TokenBudgetProvider');
  return ctx;
}

// Budgets plus the tab's live usage (`currentUsage`, `checkBudgetStatus`).
// Re-renders on every usage change; use useBudgetExhausted when only that
// flag is needed.
export function useTokenBudget() {
  const ctx = useTokenBudgetContext();
  const tokenUsage = useTokenUsageValue(ctx.tokenUsageStore);
  const currentUsage = useMemo(() => usageSummary(tokenUsage), [tokenUsage]);
  const { budgets } = ctx;
  const checkBudgetStatus = useCallback(
    (path) => budgetStatus(budgets, path, currentUsage.total),
    [budgets, currentUsage.total],
  );
  return useMemo(() => ({ ...ctx, currentUsage, checkBudgetStatus }), [ctx, currentUsage, checkBudgetStatus]);
}

// True once today's usage has used up `path`'s daily budget. Re-renders only
// when the flag flips, not on every usage poll.
export function useBudgetExhausted(path) {
  const { tokenUsageStore, budgets } = useTokenBudgetContext();
  const getSnapshot = () => {
    const { status, percentage } = budgetStatus(budgets, path, tokenTotal(tokenUsageStore.get()));
    return status === 'critical' && percentage >= 100;
  };
  return useSyncExternalStore(tokenUsageStore.subscribe, getSnapshot);
}
