import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getStartOfDay, getStartOfWeek, formatTokenCount, formatCost, computeCostFromUsage } from '../utils/tokenCalculations';
import { prepareChartData, prepareModelBreakdown, calculateEfficiencyMetrics } from '../utils/dashboardData';
import { exportToCSV, exportToJSON } from '../utils/exportData';

const STORAGE_KEY = 'lirah:token-budgets:v1';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

const TokenBudgetContext = createContext(null);

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, budgets: {}, alertStates: {} };
    const data = JSON.parse(raw);
    if (data.version !== 1) return { version: 1, budgets: {}, alertStates: {} };
    return data;
  } catch {
    return { version: 1, budgets: {}, alertStates: {} };
  }
}

function saveToStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function TokenBudgetProvider({ children, tokenUsage, projectStats, projectPath }) {
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

  const currentUsage = useMemo(() => {
    if (!tokenUsage) return { total: 0, cost: 0 };
    const total = (tokenUsage.billable_input_tokens || 0) + (tokenUsage.billable_output_tokens || 0);
    const cost = computeCostFromUsage(tokenUsage, tokenUsage.model || DEFAULT_MODEL);
    return { total, cost, model: tokenUsage.model };
  }, [tokenUsage]);

  const checkBudgetStatus = useCallback((path) => {
    const budget = storageData.budgets[path];
    if (!budget) return { status: 'none', percentage: 0 };
    const limit = budget.dailyLimit;
    if (!limit) return { status: 'none', percentage: 0 };
    const percentage = Math.min((currentUsage.total / limit) * 100, 100);
    if (percentage >= 95) return { status: 'critical', percentage };
    if (percentage >= 80) return { status: 'warning', percentage };
    return { status: 'ok', percentage };
  }, [storageData.budgets, currentUsage.total]);

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
    getBudget,
    setBudget,
    removeBudget,
    currentUsage,
    checkBudgetStatus,
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
  }), [getBudget, setBudget, removeBudget, currentUsage, checkBudgetStatus, getAlertState, dismissAlert, resetAlerts, shouldShowAlert, getHistoricalData, getModelBreakdown, getEfficiencyMetrics, exportData, projectStats]);

  return (
    <TokenBudgetContext.Provider value={value}>
      {children}
    </TokenBudgetContext.Provider>
  );
}

export function useTokenBudget() {
  const ctx = useContext(TokenBudgetContext);
  if (!ctx) throw new Error('useTokenBudget must be used within TokenBudgetProvider');
  return ctx;
}
