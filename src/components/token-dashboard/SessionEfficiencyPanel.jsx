import { formatTokenCount, formatCost } from '../../utils/tokenCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function MetricCard({ label, value, color }) {
  return (
    <div
      className="rounded px-2 py-1.5 text-center border"
      style={{
        backgroundColor: color ? `${color}15` : undefined,
        color: color || undefined,
        borderColor: color ? `${color}33` : undefined,
      }}
    >
      <div className="font-bold leading-tight" style={{ fontSize: 'var(--font-sm)' }}>{value}</div>
      <div className="opacity-80 leading-tight mt-0.5" style={{ fontSize: 'var(--font-xs)' }}>{label}</div>
    </div>
  );
}

export function SessionEfficiencyPanel({ metrics, colors = {} }) {
  if (!metrics) {
    return (
      <Card className="bg-background border-sketch h-full font-mono">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">Efficiency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-xs text-center py-4">
            No data
          </div>
        </CardContent>
      </Card>
    );
  }

  const {
    averageTokensPerMessage,
    cacheHitRate,
    outputInputRatio,
    costPerMessage,
    estimatedMonthlyCost,
  } = metrics;

  const cacheHitRatePercent = Math.round(cacheHitRate * 100);
  const outputRatioDisplay = outputInputRatio.toFixed(2);

  return (
    <Card className="bg-background border-sketch h-full flex flex-col font-mono">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium">Efficiency</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Tok/Msg" value={formatTokenCount(averageTokensPerMessage)} color={colors.input} />
          <MetricCard label="Cache Hit" value={`${cacheHitRatePercent}%`} color={colors.output} />
          <MetricCard label="Out/In" value={outputRatioDisplay} color={colors.cacheRead} />
          <MetricCard label="$/Msg" value={formatCost(costPerMessage)} color={colors.input} />
        </div>

        <div className="mt-auto pt-2 border-t border-sketch">
          <div className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
            <span>Est. Monthly:</span>{' '}
            <span className="font-bold">
              {formatCost(estimatedMonthlyCost)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
