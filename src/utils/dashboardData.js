import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { groupByDay, groupByWeek, groupByMonth } from './timeRanges';

const MODEL_PRICING = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.88, cacheWrite: 18.75 },
  'claude-opus-4-6-20250820': { input: 15, output: 75, cacheRead: 1.88, cacheWrite: 18.75 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.375, cacheWrite: 3.75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.375, cacheWrite: 3.75 },
  'default': { input: 3, output: 15, cacheRead: 0.375, cacheWrite: 3.75 },
};

export function getModelPricing(modelName) {
  if (!modelName) return MODEL_PRICING.default;
  const lowerModel = modelName.toLowerCase();
  const key = Object.keys(MODEL_PRICING).find(k => lowerModel.includes(k.toLowerCase()));
  return key ? MODEL_PRICING[key] : MODEL_PRICING.default;
}

export function computeCost(tokens, model, type = 'input') {
  const pricing = getModelPricing(model);
  const rate = pricing[type] || pricing.input;
  return (tokens / 1000000) * rate;
}

export function prepareChartData(statsCache, timeRange = 'daily') {
  if (!statsCache || !statsCache.dailyActivity) {
    return [];
  }

  const data = statsCache.dailyActivity.map(day => {
    const model = day.model || 'claude-sonnet-4-5-20250929';
    const inputTokens = (day.billable_input_tokens || day.input_tokens || 0);
    const outputTokens = (day.billable_output_tokens || day.output_tokens || 0);
    const cacheRead = (day.cache_read_input_tokens || day.cacheRead || 0);
    const cacheWrite = (day.cache_creation_input_tokens || day.cacheWrite || 0);
    
    const inputCost = computeCost(inputTokens, model, 'input');
    const outputCost = computeCost(outputTokens, model, 'output');
    const cacheReadCost = computeCost(cacheRead, model, 'cacheRead');
    const cacheWriteCost = computeCost(cacheWrite, model, 'cacheWrite');
    
    return {
      date: day.date,
      input: inputTokens,
      output: outputTokens,
      cacheRead: cacheRead,
      cacheWrite: cacheWrite,
      cost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
      model: day.model,
    };
  });

  if (timeRange === 'weekly') {
    return groupByWeek(data);
  } else if (timeRange === 'monthly') {
    return groupByMonth(data);
  }
  
  return groupByDay(data);
}

export function prepareModelBreakdown(statsCache) {
  if (!statsCache || !statsCache.dailyActivity) {
    return [];
  }

  const modelStats = {};
  statsCache.dailyActivity.forEach(day => {
    const model = day.model || 'claude-sonnet-4-5-20250929';
    if (!modelStats[model]) {
      modelStats[model] = { model, tokens: 0, cost: 0 };
    }
    
    const inputTokens = (day.billable_input_tokens || day.input_tokens || 0);
    const outputTokens = (day.billable_output_tokens || day.output_tokens || 0);
    const cacheRead = (day.cache_read_input_tokens || day.cacheRead || 0);
    const totalTokens = inputTokens + outputTokens + cacheRead;
    
    const inputCost = computeCost(inputTokens, model, 'input');
    const outputCost = computeCost(outputTokens, model, 'output');
    const cacheReadCost = computeCost(cacheRead, model, 'cacheRead');
    const totalCost = inputCost + outputCost + cacheReadCost;
    
    modelStats[model].tokens += totalTokens;
    modelStats[model].cost += totalCost;
  });

  return Object.values(modelStats);
}

export function calculateEfficiencyMetrics(statsCache, currentUsage = null) {
  if (!statsCache || !statsCache.dailyActivity) {
    return {
      averageTokensPerMessage: 0,
      cacheHitRate: 0,
      outputInputRatio: 0,
      costPerMessage: 0,
      estimatedMonthlyCost: 0,
      mostActiveDay: 'N/A',
    };
  }

  let totalTokens = 0;
  let totalMessages = 0;
  let totalCost = 0;
  let cacheReadTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const dayOfWeekTotals = {};

  statsCache.dailyActivity.forEach(day => {
    const input = (day.billable_input_tokens || day.input_tokens || 0);
    const output = (day.billable_output_tokens || day.output_tokens || 0);
    const cacheRead = (day.cache_read_input_tokens || day.cacheRead || 0);

    totalTokens += input + output + cacheRead;
    inputTokens += input;
    outputTokens += output;
    cacheReadTokens += cacheRead;
    totalMessages += (day.message_count || 0);
    totalCost += (day.cost || 0);

    const date = new Date(day.date);
    const dayName = format(date, 'EEEE');
    dayOfWeekTotals[dayName] = (dayOfWeekTotals[dayName] || 0) + input + output + cacheRead;
  });

  const mostActiveDay = Object.entries(dayOfWeekTotals)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Data is sorted descending by date from the backend, so slice(0, 7) gets the most recent
  const last7Days = statsCache.dailyActivity.slice(0, 7);
  const avgDailyCost = last7Days.length > 0
    ? last7Days.reduce((sum, d) => sum + (d.cost || 0), 0) / last7Days.length
    : 0;

  const cacheHitRate = (inputTokens + cacheReadTokens) > 0
    ? cacheReadTokens / (inputTokens + cacheReadTokens)
    : 0;

  // Output/input ratio: how many output tokens per input token (higher = more generation per context)
  const outputInputRatio = inputTokens > 0 ? outputTokens / inputTokens : 0;

  return {
    averageTokensPerMessage: totalMessages > 0 ? totalTokens / totalMessages : 0,
    cacheHitRate,
    outputInputRatio,
    costPerMessage: totalMessages > 0 ? totalCost / totalMessages : 0,
    estimatedMonthlyCost: avgDailyCost * 30,
    mostActiveDay,
  };
}

export async function getCurrentSessionData(sessionFilePath) {
  try {
    if (!sessionFilePath) return null;
    const content = await invoke('read_file_content', { path: sessionFilePath });
    const data = JSON.parse(content);
    return {
      startTime: data.startTime || new Date().toISOString(),
      totalMessages: data.messages?.length || 0,
      inputTokens: data.totalInputTokens || 0,
      outputTokens: data.totalOutputTokens || 0,
      cacheReads: data.totalCacheReadTokens || 0,
      model: data.model || 'claude-sonnet-4-5-20250929',
    };
  } catch (error) {
    console.error('Failed to load session data:', error);
    return null;
  }
}

export function getBudgetRemaining(statsCache, budget) {
  if (!budget || !statsCache) return { percentage: 0, remaining: 0 };
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayUsage = statsCache.dailyActivity
    ?.filter(d => d.date === today)
    ?.reduce((sum, d) => sum + (d.cost || 0), 0) || 0;
  
  const limit = budget.dailyLimit || Infinity;
  const remaining = Math.max(0, limit - todayUsage);
  const percentage = limit > 0 ? (remaining / limit) * 100 : 0;
  
  return { percentage, remaining };
}
