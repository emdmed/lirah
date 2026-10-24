import { useState, useMemo } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Button } from './button';
import { Input } from './input';

const PRESETS = [
  { label: 'Last 7 Days', getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: 'Last 30 Days', getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Last Month', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: 'All Time', getValue: () => ({ from: null, to: null }) },
];

export function DateRangePicker({ value, onChange, className = '' }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(value?.from ? format(new Date(value.from), 'yyyy-MM-dd') : '');
  const [customTo, setCustomTo] = useState(value?.to ? format(new Date(value.to), 'yyyy-MM-dd') : '');

  const activePreset = useMemo(() => {
    if (!value?.from && !value?.to) return 'All Time';
    return null;
  }, [value]);

  const handlePreset = (preset) => {
    const { from, to } = preset.getValue();
    onChange({
      from: from ? format(from, 'yyyy-MM-dd') : null,
      to: to ? format(to, 'yyyy-MM-dd') : null,
    });
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    if (customFrom && customTo && new Date(customFrom) <= new Date(customTo)) {
      onChange({ from: customFrom, to: customTo });
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-1 flex-wrap">
        {PRESETS.map(preset => (
          <Button
            key={preset.label}
            variant="ghost"
            size="sm"
            aria-pressed={activePreset === preset.label}
            className="h-6 font-mono px-2"
            style={{ fontSize: 'var(--font-xs)' }}
            onClick={() => handlePreset(preset)}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showCustom}
          className="h-6 font-mono px-2"
          style={{ fontSize: 'var(--font-xs)' }}
          onClick={() => setShowCustom(!showCustom)}
        >
          Custom
        </Button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="From"
            className="h-6 w-auto font-mono px-2"
            style={{ fontSize: 'var(--font-xs)' }}
          />
          <span className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>to</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="To"
            className="h-6 w-auto font-mono px-2"
            style={{ fontSize: 'var(--font-xs)' }}
          />
          <Button size="sm" className="h-6 px-2" style={{ fontSize: 'var(--font-xs)' }} onClick={handleCustomApply}>
            Apply
          </Button>
        </div>
      )}

      {value?.from && value?.to && (
        <div className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
          {value.from} — {value.to}
        </div>
      )}
    </div>
  );
}
