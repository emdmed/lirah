import { useState } from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
    { key: 'allProjects', label: 'All Projects' },
    { key: 'tokenDetails', label: 'Token details' },
    { key: 'costBreakdown', label: 'Cost breakdown' },
    { key: 'modelUsage', label: 'Model usage' },
    { key: 'sessionMetadata', label: 'Session metadata' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md font-mono">
        <DialogHeader>
          <DialogTitle className="text-sm">Export Usage Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Format</div>
            <div className="flex gap-2">
              {['csv', 'json'].map(f => (
                <Button
                  key={f}
                  variant={exportFormat === f ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => setExportFormat(f)}
                >
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Date Range</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-7 text-xs px-2 border border-sketch rounded flex-1"
                style={{ backgroundColor: 'var(--color-input-background)' }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-7 text-xs px-2 border border-sketch rounded flex-1"
                style={{ backgroundColor: 'var(--color-input-background)' }}
              />
            </div>
          </div>

          {/* Include */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Include</div>
            <div className="grid grid-cols-2 gap-1">
              {includeOptions.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={include[opt.key]}
                    onChange={() => toggleInclude(opt.key)}
                    className="rounded"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleExport}>
              Export
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
