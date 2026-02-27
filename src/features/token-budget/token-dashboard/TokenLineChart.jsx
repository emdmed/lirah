import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatTokenCount } from '../tokenCalculations';

function CustomTooltip({ active, payload, label, colors }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-background border border-sketch rounded shadow-lg p-2 text-xs font-mono">
      <p className="font-medium mb-1">{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">
              {formatTokenCount(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TokenLineChart({ data, timeRange, colors, showCache = false }) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(item => ({ ...item, displayDate: item.date }));
  }, [data]);

  const chartColors = colors || {};

  if (!processedData.length) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground font-mono">
        No usage data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={processedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColors.input} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={chartColors.input} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColors.output} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={chartColors.output} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorCache" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColors.cacheRead} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={chartColors.cacheRead} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.3} />
        <XAxis 
          dataKey="displayDate" 
          tick={{ fill: chartColors.text, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: chartColors.grid, opacity: 0.3 }}
          interval="preserveStartEnd"
        />
        <YAxis 
          tick={{ fill: chartColors.text, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}
          width={35}
        />
        <Tooltip content={<CustomTooltip colors={chartColors} />} />
        <Legend 
          wrapperStyle={{ fontSize: '10px', paddingTop: '5px' }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="input"
          name="Input"
          stroke={chartColors.input}
          fill="url(#colorInput)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="output"
          name="Output"
          stroke={chartColors.output}
          fill="url(#colorOutput)"
          strokeWidth={1.5}
        />
        {showCache && (
          <Area
            type="monotone"
            dataKey="cacheRead"
            name="Cache"
            stroke={chartColors.cacheRead}
            fill="url(#colorCache)"
            strokeWidth={1.5}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
