import { useMemo } from 'react';
import { formatCost, formatTokenCount } from '../tokenCalculations';
import { computeCost } from '../dashboardData';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

function getPieColors(colors) {
  return [
    colors?.input,
    colors?.output,
    colors?.cacheRead,
    colors?.yellow,
    colors?.red,
  ].filter(Boolean);
}

export function ModelInsights({ sessions, projects, colors }) {
  const pieColors = useMemo(() => getPieColors(colors), [colors]);

  const { modelData, pieData, recommendations, totalCost } = useMemo(() => {
    const modelMap = {};
    (sessions || []).forEach(s => {
      const model = s.model || 'unknown';
      const key = model.includes('opus') ? 'Opus' : model.includes('sonnet') ? 'Sonnet' : model;
      if (!modelMap[key]) modelMap[key] = { name: key, model, tokens: 0, cost: 0, sessions: 0, messages: 0 };
      modelMap[key].tokens += s.tokens || 0;
      modelMap[key].cost += s.cost || 0;
      modelMap[key].sessions += 1;
      modelMap[key].messages += s.messageCount || 0;
    });

    const modelData = Object.values(modelMap).sort((a, b) => b.cost - a.cost);
    const totalCost = modelData.reduce((s, m) => s + m.cost, 0);
    const pieData = modelData.map(m => ({ name: m.name, value: m.cost }));

    const recommendations = [];

    const overkillSessions = (sessions || []).filter(s => {
      return s.model?.includes('opus') &&
        s.messageCount < 10 &&
        (s.outputTokens || 0) < 2000;
    });

    if (overkillSessions.length > 0) {
      const savings = overkillSessions.reduce((sum, s) => {
        const opusCost = s.cost || 0;
        const sonnetCost = computeCost(s.inputTokens || 0, 'claude-sonnet-4-5-20250929', 'input') +
                          computeCost(s.outputTokens || 0, 'claude-sonnet-4-5-20250929', 'output') +
                          computeCost(s.cacheReadTokens || 0, 'claude-sonnet-4-5-20250929', 'cacheRead');
        return sum + (opusCost - sonnetCost);
      }, 0);

      if (savings > 0.5) {
        recommendations.push({
          priority: savings > 5 ? 'high' : savings > 1 ? 'medium' : 'low',
          text: `${overkillSessions.length} short Opus sessions could use Sonnet (est. savings: ${formatCost(savings)})`,
        });
      }
    }

    const projectMap = {};
    (sessions || []).forEach(s => {
      if (!projectMap[s.project]) projectMap[s.project] = { opus: 0, total: 0, opusCost: 0 };
      projectMap[s.project].total += 1;
      if (s.model?.includes('opus')) {
        projectMap[s.project].opus += 1;
        projectMap[s.project].opusCost += s.cost || 0;
      }
    });

    Object.entries(projectMap).forEach(([proj, data]) => {
      const opusPct = data.total > 0 ? data.opus / data.total : 0;
      if (opusPct > 0.7 && data.opusCost > 5) {
        recommendations.push({
          priority: 'medium',
          text: `${proj}: ${Math.round(opusPct * 100)}% Opus usage. Consider Sonnet for routine tasks.`,
        });
      }
    });

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        text: 'Good model balance! No significant optimization opportunities found.',
      });
    }

    return { modelData, pieData, recommendations, totalCost };
  }, [sessions, projects]);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top row: Donut + Cost breakdown */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        {/* Donut */}
        <div className="bg-background rounded border border-sketch p-3">
          <div className="text-xs font-medium mb-2">Model Distribution</div>
          {pieData.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCost(value)}
                    contentStyle={{
                      backgroundColor: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      fontSize: 'var(--font-xs)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">No data</div>
          )}
          <div className="space-y-1 mt-2">
            {modelData.map((m, i) => (
              <div key={m.name} className="flex items-center justify-between font-mono" style={{ fontSize: 'var(--font-xs)' }}>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
                  <span>{m.name}</span>
                </div>
                <span className="text-muted-foreground">{m.sessions} sessions</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cost analysis */}
        <div className="bg-background rounded border border-sketch p-3">
          <div className="text-xs font-medium mb-2">Cost Analysis</div>
          <div className="space-y-2">
            {modelData.map((m, i) => (
              <div key={m.name} className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
                  <span>{m.name}</span>
                  <span className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
                    {totalCost > 0 ? Math.round((m.cost / totalCost) * 100) : 0}%
                  </span>
                </div>
                <span className="font-medium">{formatCost(m.cost)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-sketch mt-3 pt-2 flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold" style={{ fontSize: 'var(--font-sm)' }}>{formatCost(totalCost)}</span>
          </div>
          <div className="mt-3 space-y-1">
            {modelData.map(m => (
              <div key={m.name} className="font-mono text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
                {m.name}: {formatTokenCount(m.tokens)} tokens, {m.messages} msgs
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="flex-1 bg-background rounded border border-sketch p-3 overflow-auto">
        <div className="text-xs font-medium mb-2">Optimization Recommendations</div>
        <div className="space-y-2">
          {recommendations.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs font-mono">
              <span
                className="w-2 h-2 rounded-full mt-1 shrink-0"
                style={{
                  backgroundColor: r.priority === 'high' ? colors?.red
                    : r.priority === 'medium' ? colors?.yellow
                    : colors?.output,
                }}
              />
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
