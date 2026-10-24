import { useState } from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogGroup,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ExportReportDialog({ open, onOpenChange, sessions, projects }) {
  const [exportFormat, setExportFormat] = useState('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [include, setInclude] = useState({
    allProjects: true,
    tokenDetails: true,
    costBreakdown: true,
    modelUsage: true,
    sessionMetadata: true,
  });
  const [aggregation, setAggregation] = useState('day');

  const toggleInclude = (key) => {
    setInclude(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExport = () => {
    let data = sessions || [];

    // Filter by date
    if (dateFrom) data = data.filter(s => (s.timestamp || '').slice(0, 10) >= dateFrom);
    if (dateTo) data = data.filter(s => (s.timestamp || '').slice(0, 10) <= dateTo);

    // Build rows
    const rows = data.map(s => {
      const row = { date: s.timestamp?.slice(0, 10) || '', project: s.project || '' };
      if (include.modelUsage) row.model = s.model || '';
      if (include.tokenDetails) {
        row.input_tokens = s.inputTokens || 0;
        row.output_tokens = s.outputTokens || 0;
        row.cache_read_tokens = s.cacheReadTokens || 0;
        row.total_tokens = s.tokens || 0;
      }
      if (include.costBreakdown) row.cost = (s.cost || 0).toFixed(4);
      if (include.sessionMetadata) {
        row.messages = s.messageCount || 0;
        row.session_id = s.sessionId || '';
      }
      return row;
    });

    if (exportFormat === 'csv') {
      if (!rows.length) return;
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => r[h]).join(','))].join('\n');
      downloadFile(csv, 'text/csv', `usage-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    } else {
      const json = JSON.stringify({
        exportDate: new Date().toISOString(),
        recordCount: rows.length,
        aggregation,
        data: rows,
      }, null, 2);
      downloadFile(json, 'application/json', `usage-report-${format(new Date(), 'yyyy-MM-dd')}.json`);
    }

    onOpenChange(false);
  };

  const downloadFile = (content, type, filename) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const includeOptions = [
    { key: 'allProjects', label: 'All projects' },
    { key: 'tokenDetails', label: 'Token details' },
    { key: 'costBreakdown', label: 'Cost breakdown' },
    { key: 'modelUsage', label: 'Model usage' },
    { key: 'sessionMetadata', label: 'Session metadata' },
  ];

  const rangeCount = (sessions || []).filter((s) => {
    const d = (s.timestamp || '').slice(0, 10);
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        escLabel="cancel"
        status={<span className="tabular-nums">{rangeCount} session{rangeCount === 1 ? '' : 's'}</span>}
      >
        <DialogTitle>Export usage report</DialogTitle>
        <DialogDescription className="sr-only">
          Pick a format, a date range and which columns to include, then export.
        </DialogDescription>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="ins-legend" id="export-format-label">Format</span>
            <div className="flex gap-1" role="group" aria-labelledby="export-format-label">
              {['csv', 'json'].map(f => (
                <Button
                  key={f}
                  variant="ghost"
                  size="sm"
                  aria-pressed={exportFormat === f}
                  className="h-7 px-3 text-xs"
                  onClick={() => setExportFormat(f)}
                >
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ins-legend">Dates</span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="From"
                className="h-7 flex-1 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="To"
                className="h-7 flex-1 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <DialogGroup label="Include" />
            <div className="grid grid-cols-2 gap-1.5">
              {includeOptions.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={include[opt.key]}
                    onChange={() => toggleInclude(opt.key)}
                    className="accent-[var(--ins-lamp)]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exportFormat === 'csv' && rangeCount === 0}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
