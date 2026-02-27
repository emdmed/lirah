import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarHeatmap } from './CalendarHeatmap';
import { FilterPanel } from './FilterPanel';
import { formatCost, formatTokenCount } from '../tokenCalculations';
import { filterSessions } from '../../../utils/projectScanner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 20;

export function HistoricalBrowser({ sessions, projects, models, colors }) {
  const [filters, setFilters] = useState({
    projects: [],
    models: [],
    dateFrom: null,
    dateTo: null,
    minTokens: null,
    maxTokens: null,
  });
  const [page, setPage] = useState(0);
  const [expandedSession, setExpandedSession] = useState(null);
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = useMemo(() => {
    let result = filterSessions(sessions || [], filters);
    result.sort((a, b) => {
      const va = a[sortKey] || 0;
      const vb = b[sortKey] || 0;
      if (sortKey === 'timestamp') {
        return sortDir === 'desc'
          ? new Date(vb) - new Date(va)
          : new Date(va) - new Date(vb);
      }
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return result;
  }, [sessions, filters, sortKey, sortDir]);

  const paged = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const handleDayClick = (dateStr) => {
    setFilters(f => ({ ...f, dateFrom: dateStr, dateTo: dateStr }));
    setPage(0);
  };

  const formatModel = (m) => {
    if (!m) return 'Unknown';
    if (m.includes('opus')) return 'Opus';
    if (m.includes('sonnet')) return 'Sonnet';
    return m;
  };

  const formatTime = (ts) => {
    if (!ts) return '\u2014';
    try {
      return format(new Date(ts), 'MMM dd, yyyy HH:mm');
    } catch {
      return ts.slice(0, 16);
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <FilterPanel
        filters={filters}
        onChange={(f) => { setFilters(f); setPage(0); }}
        projects={projects}
        models={models}
      />

      {/* Calendar Heatmap */}
      <div className="bg-background rounded border border-sketch p-3 shrink-0 overflow-x-auto">
        <div className="text-xs font-medium mb-2">Activity (Last 12 Months)</div>
        <CalendarHeatmap sessions={sessions} onDayClick={handleDayClick} colors={colors} />
      </div>

      {/* Session List */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1 shrink-0">
          <span className="text-muted-foreground font-mono" style={{ fontSize: 'var(--font-xs)' }}>
            {filtered.length} session{filtered.length !== 1 ? 's' : ''} found
          </span>
          <div className="flex items-center gap-1">
            {['timestamp', 'tokens', 'cost'].map(k => (
              <Button
                key={k}
                variant={sortKey === k ? 'default' : 'outline'}
                size="sm"
                className="h-5 text-xs font-mono px-2"
                onClick={() => {
                  if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                  else { setSortKey(k); setSortDir('desc'); }
                }}
              >
                {k === 'timestamp' ? 'Date' : k === 'tokens' ? 'Tokens' : 'Cost'}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto border border-sketch rounded">
          {paged.map((s) => (
            <div key={s.sessionId + s.timestamp} className="border-b border-sketch/50">
              <button
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/20 text-xs font-mono text-left"
                onClick={() => setExpandedSession(expandedSession === s.sessionId ? null : s.sessionId)}
              >
                {expandedSession === s.sessionId ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="w-36 shrink-0">{formatTime(s.timestamp)}</span>
                <span className="w-16 text-right shrink-0">{formatTokenCount(s.tokens)}</span>
                <span className="w-14 text-right shrink-0">{formatCost(s.cost)}</span>
                <span className="w-16 shrink-0 text-muted-foreground">{s.project}</span>
                <span className="text-muted-foreground">{formatModel(s.model)}</span>
                <span className="ml-auto text-muted-foreground">{s.messageCount} msgs</span>
              </button>

              {expandedSession === s.sessionId && (
                <div className="px-8 py-2 bg-muted/10 font-mono space-y-1 border-t border-sketch/30" style={{ fontSize: 'var(--font-xs)' }}>
                  <div className="grid grid-cols-3 gap-2">
                    <div>Input: {formatTokenCount(s.inputTokens)}</div>
                    <div>Output: {formatTokenCount(s.outputTokens)}</div>
                    <div>Cache: {formatTokenCount(s.cacheReadTokens)}</div>
                  </div>
                  <div className="text-muted-foreground truncate">File: {s.sessionFile}</div>
                </div>
              )}
            </div>
          ))}

          {paged.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">
              No sessions match your filters
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs font-mono px-2"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-muted-foreground font-mono" style={{ fontSize: 'var(--font-xs)' }}>
              Page {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs font-mono px-2"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
