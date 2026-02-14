import { formatTokenCount, formatCost } from '../../utils/tokenCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function MetricCard({ label, value, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    amber: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  };

  return (
    <div className={`${colorClasses[color]} rounded px-2 py-1.5 text-center border`}>
      <div className="text-sm font-bold leading-tight">{value}</div>
      <div className="text-[10px] opacity-80 leading-tight mt-0.5">{label}</div>
    </div>
  );
}

export function SessionEfficiencyPanel({ metrics }) {
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
    contextUtilization,
    costPerMessage,
    estimatedMonthlyCost,
  } = metrics;

  const cacheHitRatePercent = Math.round(cacheHitRate * 100);
  const contextUtilPercent = Math.round(contextUtilization * 100);

  return (
    <Card className="bg-background border-sketch h-full flex flex-col font-mono">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium">Efficiency</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Tok/Msg" value={formatTokenCount(averageTokensPerMessage)} color="blue" />
          <MetricCard label="Cache" value={`${cacheHitRatePercent}%`} color="green" />
          <MetricCard label="Ctx" value={`${contextUtilPercent}%`} color="purple" />
          <MetricCard label="$/Msg" value={formatCost(costPerMessage)} color="amber" />
        </div>

        <div className="mt-auto pt-2 border-t border-sketch">
          <div className="text-[10px] text-muted-foreground">
            <span className="">Monthly:</span>{' '}
            <span className="font-bold">
              {formatCost(estimatedMonthlyCost)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
