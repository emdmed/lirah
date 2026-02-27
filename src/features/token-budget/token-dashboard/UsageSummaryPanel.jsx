import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTokenCount, formatCost } from '../tokenCalculations';
import { Clock, MessageSquare, Zap, Database, Coins, Layers } from 'lucide-react';

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

export function UsageSummaryPanel({ sessionData, tokenUsage, colors = {} }) {
  const startTime = sessionData?.startTime
    ? format(new Date(sessionData.startTime), 'HH:mm')
    : '--:--';

  const totalMessages = sessionData?.totalMessages || 0;
  const inputTokens = tokenUsage?.billable_input_tokens || sessionData?.inputTokens || 0;
  const outputTokens = tokenUsage?.billable_output_tokens || sessionData?.outputTokens || 0;
  const cacheReads = sessionData?.cacheReads || 0;
  const totalCost = tokenUsage?.totalCost || (inputTokens + outputTokens) * 0.000003 || 0;
  const model = sessionData?.model || tokenUsage?.model || 'claude-sonnet-4-5';

  const modelDisplay = model.toLowerCase().includes('opus') ? 'Opus' : model.toLowerCase().includes('sonnet') ? 'Sonnet' : model;

  const c = colors;

  return (
    <Card className="bg-background border-sketch h-full flex flex-col font-mono">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium">Session</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col">
        <div className="space-y-0.5">
          <StatRow icon={Clock} label="Started" value={startTime} color={c.input} />
          <StatRow icon={MessageSquare} label="Messages" value={totalMessages.toString()} color={c.output} />
          <StatRow icon={Database} label="Input" value={formatTokenCount(inputTokens)} color={c.cacheRead} />
          <StatRow icon={Zap} label="Output" value={formatTokenCount(outputTokens)} color={c.input} />
          <StatRow icon={Layers} label="Cache" value={formatTokenCount(cacheReads)} color={c.output} />
          <StatRow icon={Coins} label="Cost" value={formatCost(totalCost)} color={c.cacheRead} />
        </div>

        <div className="mt-auto pt-2 border-t border-sketch">
          <div className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
            <span>Model:</span>{' '}
            <span>{modelDisplay}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
