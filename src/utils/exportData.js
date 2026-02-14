import { format } from 'date-fns';

export function exportToCSV(data, timeRange) {
  const headers = ['date', 'project', 'model', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'total_cost'];
  
  const rows = data.map(item => [
    item.date,
    item.project || 'lirah',
    item.model || 'claude-sonnet-4-5-20250929',
    item.input || 0,
    item.output || 0,
    item.cacheRead || 0,
    item.cacheWrite || 0,
    (item.cost || 0).toFixed(4),
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `token-usage-${timeRange}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToJSON(data, timeRange, metadata = {}) {
  const exportData = {
    exportDate: new Date().toISOString(),
    timeRange,
    metadata: {
      totalRecords: data.length,
      ...metadata,
    },
    data: data.map(item => ({
      date: item.date,
      project: item.project || 'lirah',
      model: item.model || 'claude-sonnet-4-5-20250929',
      inputTokens: item.input || 0,
      outputTokens: item.output || 0,
      cacheReadTokens: item.cacheRead || 0,
      cacheWriteTokens: item.cacheWrite || 0,
      cost: item.cost || 0,
    })),
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `token-usage-${timeRange}-${format(new Date(), 'yyyy-MM-dd')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatExportDate(date) {
  return format(new Date(date), 'yyyy-MM-dd HH:mm:ss');
}
