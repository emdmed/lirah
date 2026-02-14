import { invoke } from '@tauri-apps/api/core';
import cache from './dataCache';
import { computeCost } from './dashboardData';

export async function scanAllProjects(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cache.getProjects();
    if (cached) return cached;
  }

  const raw = await invoke('get_all_projects_stats');

  const projects = raw.projects.map(p => ({
    path: p.path,
    name: p.name,
    totalTokens: p.total_tokens,
    totalCost: p.total_cost,
    sessionCount: p.session_count,
    messageCount: p.message_count,
    lastActivity: p.last_activity,
    dailyAverage: p.daily_average,
    modelSplit: p.model_split || {},
    dailyActivity: p.daily_activity || [],
    sessions: (p.sessions || []).map(s => ({
      sessionId: s.session_id,
      sessionFile: s.session_file,
      model: s.model,
      inputTokens: s.input_tokens,
      outputTokens: s.output_tokens,
      cacheReadTokens: s.cache_read_input_tokens,
      cacheCreationTokens: s.cache_creation_input_tokens,
      messageCount: s.message_count,
      timestamp: s.timestamp,
      tokens: s.input_tokens + s.output_tokens + s.cache_read_input_tokens,
      cost: computeCost(s.input_tokens, s.model, 'input') +
            computeCost(s.output_tokens, s.model, 'output') +
            computeCost(s.cache_read_input_tokens, s.model, 'cacheRead'),
      project: p.name,
    })),
  }));

  const totals = {
    allProjectsTokens: raw.totals.all_projects_tokens,
    allProjectsCost: raw.totals.all_projects_cost,
    totalSessions: raw.totals.total_sessions,
  };

  const result = { projects, totals };
  cache.setProjects(result);
  return result;
}

export function getAllSessions(projectsData) {
  if (!projectsData?.projects) return [];
  return projectsData.projects.flatMap(p => p.sessions)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function filterSessions(sessions, filters) {
  return sessions.filter(s => {
    if (filters.projects?.length && !filters.projects.includes(s.project)) return false;
    if (filters.models?.length && !filters.models.includes(s.model)) return false;
    if (filters.dateFrom && new Date(s.timestamp) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(s.timestamp) > to) return false;
    }
    if (filters.minTokens && s.tokens < filters.minTokens) return false;
    if (filters.maxTokens && s.tokens > filters.maxTokens) return false;
    if (filters.minCost && s.cost < filters.minCost) return false;
    if (filters.maxCost && s.cost > filters.maxCost) return false;
    return true;
  });
}
