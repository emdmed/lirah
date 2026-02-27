import { useMemo, useState } from 'react';
import { eachDayOfInterval, startOfWeek, format, getDay, subYears } from 'date-fns';

const DAYS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function getIntensityLevel(tokens, max) {
  if (!tokens || tokens === 0) return 0;
  const ratio = tokens / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

function getHeatmapColors(colors) {
  const base = colors?.green || colors?.output;
  if (!base) return ['var(--color-muted)', null, null, null, null];
  // Generate opacity variants from theme color
  return [
    'var(--color-muted)',
    `${base}33`,
    `${base}66`,
    `${base}99`,
    base,
  ];
}

export function CalendarHeatmap({ sessions, onDayClick, colors }) {
  const [tooltip, setTooltip] = useState(null);
  const heatColors = useMemo(() => getHeatmapColors(colors), [colors]);

  const { weeks, months, maxTokens } = useMemo(() => {
    const now = new Date();
    const yearAgo = subYears(now, 1);
    const start = startOfWeek(yearAgo, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end: now });

    const dayMap = {};
    (sessions || []).forEach(s => {
      const d = s.timestamp?.slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { tokens: 0, cost: 0, count: 0 };
      dayMap[d].tokens += s.tokens || 0;
      dayMap[d].cost += s.cost || 0;
      dayMap[d].count += 1;
    });

    const maxTokens = Math.max(1, ...Object.values(dayMap).map(d => d.tokens));

    const weeks = [];
    let currentWeek = [];
    days.forEach((day) => {
      const dayOfWeek = getDay(day);
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      const key = format(day, 'yyyy-MM-dd');
      const data = dayMap[key] || { tokens: 0, cost: 0, count: 0 };
      currentWeek.push({ date: day, key, ...data });
    });
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const months = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstDay = week[0];
      const month = firstDay.date.getMonth();
      if (month !== lastMonth) {
        months.push({ label: format(firstDay.date, 'MMM'), weekIndex: wi });
        lastMonth = month;
      }
    });

    return { weeks, months, maxTokens };
  }, [sessions]);

  const cellSize = 12;
  const gap = 2;

  return (
    <div className="relative">
      {/* Month labels */}
      <div className="flex ml-8 mb-1" style={{ gap: 0 }}>
        {months.map((m, i) => (
          <div
            key={i}
            className="text-muted-foreground font-mono"
            style={{ position: 'absolute', left: 32 + m.weekIndex * (cellSize + gap), fontSize: 'var(--font-xs)' }}
          >
            {m.label}
          </div>
        ))}
      </div>

      <div className="flex mt-4">
        {/* Day labels */}
        <div className="flex flex-col mr-1" style={{ gap }}>
          {DAYS.map((d, i) => (
            <div key={i} className="text-muted-foreground font-mono" style={{ height: cellSize, lineHeight: `${cellSize}px`, fontSize: 'var(--font-xs)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex" style={{ gap }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap }}>
              {Array.from({ length: 7 }, (_, di) => {
                const day = week.find(d => getDay(d.date) === di);
                if (!day) return <div key={di} style={{ width: cellSize, height: cellSize }} />;

                const level = getIntensityLevel(day.tokens, maxTokens);
                return (
                  <div
                    key={di}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: heatColors[level],
                      borderRadius: 2,
                      cursor: day.count > 0 ? 'pointer' : 'default',
                    }}
                    onMouseEnter={(e) => setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      date: format(day.date, 'MMM dd, yyyy'),
                      tokens: day.tokens,
                      cost: day.cost,
                      count: day.count,
                    })}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => day.count > 0 && onDayClick?.(format(day.date, 'yyyy-MM-dd'))}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 ml-8">
        <span className="text-muted-foreground font-mono" style={{ fontSize: 'var(--font-xs)' }}>Less</span>
        {heatColors.map((c, i) => (
          <div key={i} style={{ width: cellSize, height: cellSize, backgroundColor: c, borderRadius: 2 }} />
        ))}
        <span className="text-muted-foreground font-mono" style={{ fontSize: 'var(--font-xs)' }}>More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-popover text-popover-foreground border border-sketch rounded px-2 py-1 font-mono pointer-events-none shadow-lg"
          style={{ left: tooltip.x + 10, top: tooltip.y - 40, fontSize: 'var(--font-xs)' }}
        >
          <div className="font-medium">{tooltip.date}</div>
          <div>{tooltip.tokens.toLocaleString()} tokens ({tooltip.count} session{tooltip.count !== 1 ? 's' : ''})</div>
          <div>${tooltip.cost.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
