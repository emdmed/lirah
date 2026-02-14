import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { formatTokenCount, formatCost } from '../../utils/tokenCalculations';

function CustomTooltip({ active, payload, colors }) {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  const totalTokens = payload[0].payload.totalTokens || 1;
  const percentage = ((data.tokens / totalTokens) * 100).toFixed(1);
  
  return (
    <div className="bg-[hsl(var(--color-card))] border border-[hsl(var(--color-border))] rounded-lg shadow-lg p-3">
      <p className="font-medium text-[hsl(var(--color-foreground))]">{data.model}</p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-[hsl(var(--color-muted-foreground))]">Tokens:</span>
          <span className="font-medium text-[hsl(var(--color-foreground))]">{formatTokenCount(data.tokens)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[hsl(var(--color-muted-foreground))]">Cost:</span>
          <span className="font-medium text-[hsl(var(--color-foreground))]">{formatCost(data.cost)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[hsl(var(--color-muted-foreground))]">Percentage:</span>
          <span className="font-medium text-[hsl(var(--color-foreground))]">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

function CenterLabel({ totalCost, textColor }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
      <tspan x="50%" dy="-10" className="text-xs" fill={textColor}>
        Total Cost
      </tspan>
      <tspan x="50%" dy="20" className="text-sm font-bold" fill={textColor}>
        {formatCost(totalCost)}
      </tspan>
    </text>
  );
}

export function ModelPieChart({ data, colors }) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const totalTokens = data.reduce((sum, item) => sum + item.tokens, 0);
    const totalCost = data.reduce((sum, item) => sum + item.cost, 0);
    
    return data.map(item => ({
      ...item,
      totalTokens,
      totalCost,
      displayModel: item.model.toLowerCase().includes('opus') ? 'Claude Opus' : 
                    item.model.toLowerCase().includes('sonnet') ? 'Claude Sonnet' : 
                    item.model,
    }));
  }, [data]);

  const totalCost = processedData[0]?.totalCost || 0;
  const textColor = colors?.text || '#374151';

  // Use theme colors for pie chart
  const pieColors = [
    colors?.blue || '#3b82f6',
    colors?.green || '#22c55e',
    colors?.magenta || '#a855f7',
    colors?.yellow || '#f59e0b',
    colors?.red || '#ef4444',
  ];

  if (!processedData.length) {
    return (
      <div className="flex items-center justify-center h-48 text-[hsl(var(--color-muted-foreground))]">
        No model data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={processedData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="tokens"
          nameKey="displayModel"
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          labelLine={true}
          isAnimationActive={true}
        >
          {processedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip colors={colors} />} />
        <Legend verticalAlign="bottom" height={36} />
        {totalCost > 0 && <CenterLabel totalCost={totalCost} textColor={textColor} />}
      </PieChart>
    </ResponsiveContainer>
  );
}
