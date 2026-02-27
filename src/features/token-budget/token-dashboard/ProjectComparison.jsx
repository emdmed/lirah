import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { formatCost, formatTokenCount } from '../tokenCalculations';

const SORT_OPTIONS = [
  { key: 'totalCost', label: 'Cost' },
  { key: 'totalTokens', label: 'Tokens' },
  { key: 'sessionCount', label: 'Sessions' },
  { key: 'lastActivity', label: 'Last Active' },
  { key: 'name', label: 'Name' },
];

export function ProjectComparison({ projects, totals, colors }) {
  const [sortKey, setSortKey] = useState('totalCost');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    let filtered = projects || [];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }
    return [...filtered].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'name') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (sortKey === 'lastActivity') {
        va = new Date(va || 0).getTime();
        vb = new Date(vb || 0).getTime();
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [projects, sortKey, sortDir, search]);

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ArrowUpDown size={10} className="opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  };

  const columns = [
    { key: 'name', label: 'Project', width: 'flex-1 min-w-[120px]' },
    { key: 'totalTokens', label: 'Tokens', width: 'w-20 text-right' },
    { key: 'totalCost', label: 'Cost', width: 'w-16 text-right' },
    { key: 'sessionCount', label: 'Sessions', width: 'w-16 text-right' },
    { key: 'messageCount', label: 'Msgs', width: 'w-14 text-right' },
    { key: 'dailyAverage', label: 'Avg/Day', width: 'w-16 text-right' },
    { key: 'lastActivity', label: 'Last Active', width: 'w-20 text-right' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter projects..."
            className="w-full h-7 text-xs font-mono pl-7 pr-2 border border-sketch rounded"
            style={{ backgroundColor: 'var(--color-input-background)' }}
          />
        </div>
        <span className="text-muted-foreground whitespace-nowrap" style={{ fontSize: 'var(--font-xs)' }}>
          {sorted.length} project{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border border-sketch rounded">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-sketch bg-muted/30 sticky top-0">
          {columns.map(col => (
            <button
              key={col.key}
              className={`flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground ${col.width}`}
              style={{ fontSize: 'var(--font-xs)' }}
              onClick={() => handleSort(col.key)}
            >
              {col.label}
              <SortIcon col={col.key} />
            </button>
          ))}
        </div>

        {/* Rows */}
        {sorted.map((p) => (
          <div
            key={p.path}
            className="flex items-center gap-2 px-3 py-2 border-b border-sketch/50 hover:bg-muted/20 text-xs font-mono"
          >
            <div className="flex-1 min-w-[120px] truncate font-medium">{p.name}</div>
            <div className="w-20 text-right text-muted-foreground">{formatTokenCount(p.totalTokens)}</div>
            <div className="w-16 text-right">{formatCost(p.totalCost)}</div>
            <div className="w-16 text-right text-muted-foreground">{p.sessionCount}</div>
            <div className="w-14 text-right text-muted-foreground">{p.messageCount}</div>
            <div className="w-16 text-right text-muted-foreground">{formatTokenCount(p.dailyAverage)}</div>
            <div className="w-20 text-right text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>{p.lastActivity || '\u2014'}</div>
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">
            {search ? 'No projects match your search' : 'No projects found in ~/.claude/projects'}
          </div>
        )}

        {/* Totals row */}
        {sorted.length > 0 && totals && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 text-xs font-mono font-bold sticky bottom-0">
            <div className="flex-1 min-w-[120px]">Total</div>
            <div className="w-20 text-right">{formatTokenCount(totals.allProjectsTokens)}</div>
            <div className="w-16 text-right">{formatCost(totals.allProjectsCost)}</div>
            <div className="w-16 text-right">{totals.totalSessions}</div>
            <div className="w-14 text-right">{'\u2014'}</div>
            <div className="w-16 text-right">{'\u2014'}</div>
            <div className="w-20 text-right">{'\u2014'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
