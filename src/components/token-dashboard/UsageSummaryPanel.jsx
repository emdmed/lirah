import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTokenCount, formatCost } from '../../utils/tokenCalculations';
import { Clock, MessageSquare, Zap, Database, Coins, Layers } from 'lucide-react';

function StatRow({ icon: Icon, label, value, color = 'blue' }) {
  const colorClasses = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    amber: 'text-yellow-500',
  };

  return (
    <div className="flex items-center gap-2 py-0.5">
      <Icon size={12} className={colorClasses[color]} />
      <div className="flex-1 flex justify-between items-center text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

export function UsageSummaryPanel({ sessionData, tokenUsage }) {
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

  return (
    <Card className="bg-background border-sketch h-full flex flex-col font-mono">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium">Session</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col">
        <div className="space-y-0.5">
          <StatRow icon={Clock} label="Started" value={startTime} color="blue" />
          <StatRow icon={MessageSquare} label="Messages" value={totalMessages.toString()} color="green" />
          <StatRow icon={Database} label="Input" value={formatTokenCount(inputTokens)} color="purple" />
          <StatRow icon={Zap} label="Output" value={formatTokenCount(outputTokens)} color="amber" />
          <StatRow icon={Layers} label="Cache" value={formatTokenCount(cacheReads)} color="blue" />
          <StatRow icon={Coins} label="Cost" value={formatCost(totalCost)} color="green" />
        </div>
        
        <div className="mt-auto pt-2 border-t border-sketch">
          <div className="text-[10px] text-muted-foreground">
            <span className="">Model:</span>{' '}
            <span className="">{modelDisplay}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
