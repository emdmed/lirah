import { formatTokenCount, formatCost } from '../tokenCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gauge, Target, ArrowRightLeft, DollarSign } from 'lucide-react';

function StatRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Icon size={12} style={{ color }} />
      <div className="flex-1 flex justify-between items-center text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
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

  const c = colors;

  return (
    <Card className="bg-background border-sketch h-full flex flex-col font-mono">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium">Efficiency</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col">
        <div className="space-y-0.5">
          <StatRow icon={Gauge} label="Tok/Msg" value={formatTokenCount(averageTokensPerMessage)} color={c.input} />
          <StatRow icon={Target} label="Cache Hit" value={`${cacheHitRatePercent}%`} color={c.output} />
          <StatRow icon={ArrowRightLeft} label="Out/In Ratio" value={outputRatioDisplay} color={c.cacheRead} />
          <StatRow icon={DollarSign} label="$/Msg" value={formatCost(costPerMessage)} color={c.input} />
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
