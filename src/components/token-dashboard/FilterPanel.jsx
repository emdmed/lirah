import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { Filter, X } from 'lucide-react';

export function FilterPanel({ filters, onChange, projects = [], models = [] }) {
  const [expanded, setExpanded] = useState(false);

  const updateFilter = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key, value) => {
    const current = filters[key] || [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updateFilter(key, next);
  };

  const resetFilters = () => {
    onChange({
      projects: [],
      models: [],
      dateFrom: null,
      dateTo: null,
      minTokens: null,
      maxTokens: null,
      minCost: null,
      maxCost: null,
    });
  };

  const hasActiveFilters = filters.projects?.length || filters.models?.length ||
    filters.dateFrom || filters.dateTo || filters.minTokens || filters.maxTokens;

  return (
    <div className="bg-background rounded border border-sketch p-2">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter size={12} />
          Filters
          {hasActiveFilters && (
            <span className="bg-primary/20 text-primary rounded px-1" style={{ fontSize: 'var(--font-xs)' }}>Active</span>
          )}
        </button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-5 px-1 gap-1" style={{ fontSize: 'var(--font-xs)' }} onClick={resetFilters}>
            <X size={10} />
            Reset
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-3">
          <DateRangePicker
            value={{ from: filters.dateFrom, to: filters.dateTo }}
            onChange={({ from, to }) => onChange({ ...filters, dateFrom: from, dateTo: to })}
          />

          {projects.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1" style={{ fontSize: 'var(--font-xs)' }}>Projects</div>
              <div className="flex flex-wrap gap-1">
                {projects.map(p => (
                  <Button
                    key={p}
                    variant={filters.projects?.includes(p) ? 'default' : 'outline'}
                    size="sm"
                    className="h-5 font-mono px-2"
                    style={{ fontSize: 'var(--font-xs)' }}
                    onClick={() => toggleArrayFilter('projects', p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {models.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1" style={{ fontSize: 'var(--font-xs)' }}>Models</div>
              <div className="flex flex-wrap gap-1">
                {models.map(m => (
                  <Button
                    key={m}
                    variant={filters.models?.includes(m) ? 'default' : 'outline'}
                    size="sm"
                    className="h-5 font-mono px-2"
                    style={{ fontSize: 'var(--font-xs)' }}
                    onClick={() => toggleArrayFilter('models', m)}
                  >
                    {m?.includes('opus') ? 'Opus' : m?.includes('sonnet') ? 'Sonnet' : m}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
