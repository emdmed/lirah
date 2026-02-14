import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileJson, RefreshCw } from 'lucide-react';
import { TokenLineChart } from './token-dashboard/TokenLineChart';
import { SessionEfficiencyPanel } from './token-dashboard/SessionEfficiencyPanel';
import { UsageSummaryPanel } from './token-dashboard/UsageSummaryPanel';
import { prepareChartData, calculateEfficiencyMetrics, prepareModelBreakdown, computeCost } from '../utils/dashboardData';
import { exportToCSV, exportToJSON } from '../utils/exportData';
import { formatCost } from '../utils/tokenCalculations';

export function TokenDashboard({ open, onOpenChange, tokenUsage, projectStats, refreshStats, projectPath, theme }) {
  const [timeRange, setTimeRange] = useState('daily');
  const [selectedModel, setSelectedModel] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Refresh stats when dialog opens
  useEffect(() => {
    if (open && refreshStats) {
      refreshStats();
    }
  }, [open, refreshStats]);

  const handleRefresh = () => {
    if (refreshStats && !refreshing) {
      setRefreshing(true);
      refreshStats();
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const statsCache = useMemo(() => {
    if (!projectStats) return { dailyActivity: [] };
    return {
      dailyActivity: projectStats.daily_activity || [],
    };
  }, [projectStats]);

  const modelBreakdown = useMemo(() => {
    return prepareModelBreakdown(statsCache);
  }, [statsCache]);

  const filteredStatsCache = useMemo(() => {
    if (selectedModel === 'all' || !projectStats?.daily_activity) return statsCache;
    return {
      dailyActivity: projectStats.daily_activity.filter(d => 
        d.model?.toLowerCase().includes(selectedModel.toLowerCase())
      ),
    };
  }, [statsCache, selectedModel, projectStats]);

  const chartData = useMemo(() => {
    return prepareChartData(filteredStatsCache, timeRange);
  }, [filteredStatsCache, timeRange]);

  const efficiencyMetrics = useMemo(() => {
    return calculateEfficiencyMetrics(filteredStatsCache, tokenUsage);
  }, [filteredStatsCache, tokenUsage]);

  const totalStats = useMemo(() => {
    if (!chartData.length) return { input: 0, output: 0, cacheRead: 0, cost: 0 };
    return chartData.reduce((acc, day) => ({
      input: acc.input + (day.input || 0),
      output: acc.output + (day.output || 0),
      cacheRead: acc.cacheRead + (day.cacheRead || 0),
      cost: acc.cost + (day.cost || 0),
    }), { input: 0, output: 0, cacheRead: 0, cost: 0 });
  }, [chartData]);

  const currentSessionData = useMemo(() => {
    if (!projectStats?.sessions?.length) return null;
    const sessions = selectedModel === 'all' 
      ? projectStats.sessions 
      : projectStats.sessions.filter(s => s.model?.toLowerCase().includes(selectedModel.toLowerCase()));
    if (!sessions.length) return null;
    const latestSession = sessions[0];
    return {
      startTime: latestSession.timestamp,
      totalMessages: sessions.length,
      inputTokens: sessions.reduce((sum, s) => sum + (s.input_tokens || 0), 0),
      outputTokens: sessions.reduce((sum, s) => sum + (s.output_tokens || 0), 0),
      cacheReads: sessions.reduce((sum, s) => sum + (s.cache_read_input_tokens || 0), 0),
      model: latestSession.model || 'claude-sonnet-4-5-20250929',
    };
  }, [projectStats, selectedModel]);

  const handleExportCSV = () => {
    exportToCSV(chartData, timeRange);
  };

  const handleExportJSON = () => {
    exportToJSON(chartData, timeRange, {
      project: projectPath,
      totalCost: totalStats.cost,
      models: projectStats?.models || [],
    });
  };

  const terminalColors = theme?.terminal || {};
  const chartColors = {
    input: terminalColors.blue || '#89b4fa',
    output: terminalColors.green || '#a6e3a1',
    cacheRead: terminalColors.magenta || '#f5c2e7',
    text: terminalColors.foreground || '#cdd6f4',
    grid: terminalColors.black || '#45475a',
  };

  const formatModelName = (model) => {
    if (!model) return 'Unknown';
    if (model.toLowerCase().includes('opus')) return 'Opus';
    if (model.toLowerCase().includes('sonnet')) return 'Sonnet';
    return model;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] h-[92vh] max-w-[1400px] max-h-[900px] p-0 flex flex-col overflow-hidden font-mono">
        <DialogHeader className="px-4 py-3 pr-10 border-b border-sketch shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Token Usage Dashboard
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Tabs value={timeRange} onValueChange={setTimeRange}>
                <TabsList className="h-8">
                  <TabsTrigger value="daily" className="text-xs px-3 font-mono">Daily</TabsTrigger>
                  <TabsTrigger value="weekly" className="text-xs px-3 font-mono">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly" className="text-xs px-3 font-mono">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-mono">
                    <Download size={12} />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV} className="gap-2 text-xs font-mono">
                    <FileSpreadsheet size={12} />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportJSON} className="gap-2 text-xs font-mono">
                    <FileJson size={12} />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-1 text-xs font-mono"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 flex-1 flex flex-col gap-3 overflow-hidden">
          {/* Model filter tabs */}
          {projectStats?.models && projectStats.models.length > 0 && (
            <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Models:</span>
              <Button
                variant={selectedModel === 'all' ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-xs font-mono px-2 shrink-0"
                onClick={() => setSelectedModel('all')}
              >
                All
              </Button>
              {projectStats.models.map(model => (
                <Button
                  key={model}
                  variant={selectedModel === model ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-xs font-mono px-2 shrink-0"
                  onClick={() => setSelectedModel(model)}
                >
                  {formatModelName(model)}
                </Button>
              ))}
            </div>
          )}

          {/* Main grid */}
          <div className="flex-1 grid grid-cols-3 gap-3 min-h-0">
            {/* Left col - Chart */}
            <div className="col-span-2 bg-background rounded border border-sketch p-3 flex flex-col min-h-0">
              <div className="text-xs font-medium mb-2 shrink-0">Token Usage Over Time</div>
              <div className="flex-1 min-h-0">
                <TokenLineChart 
                  data={chartData} 
                  timeRange={timeRange}
                  colors={chartColors}
                />
              </div>
            </div>

            {/* Right col - Model breakdown */}
            <div className="flex flex-col gap-3 min-h-0 overflow-auto">
              {/* Model stats */}
              <div className="bg-background rounded border border-sketch p-3 shrink-0">
                <div className="text-xs font-medium mb-2">By Model</div>
                <div className="space-y-2">
                  {modelBreakdown.map((mb, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: idx === 0 ? chartColors.input : idx === 1 ? chartColors.output : chartColors.cacheRead }}
                        />
                        <span>{formatModelName(mb.model)}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCost(mb.cost)}</div>
                        <div className="text-muted-foreground text-[10px]">
                          {(mb.tokens / 1000).toFixed(1)}k tokens
                        </div>
                      </div>
                    </div>
                  ))}
                  {modelBreakdown.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-2">No data</div>
                  )}
                </div>
              </div>

              {/* Current session */}
              <UsageSummaryPanel
                sessionData={currentSessionData}
                tokenUsage={tokenUsage}
                colors={chartColors}
              />

              {/* Efficiency */}
              <SessionEfficiencyPanel metrics={efficiencyMetrics} colors={chartColors} />
            </div>
          </div>

          {/* Cost breakdown row */}
          <div className="bg-background rounded border border-sketch p-3 shrink-0">
            <div className="text-xs font-medium mb-2">Cost Breakdown</div>
            <div className="flex items-center gap-6 text-xs">
              {modelBreakdown.map((mb, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: idx === 0 ? chartColors.input : idx === 1 ? chartColors.output : chartColors.cacheRead }}
                  />
                  <span className="text-muted-foreground">{formatModelName(mb.model)}:</span>
                  <span className="font-medium">{formatCost(mb.cost)}</span>
                </div>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-bold text-lg">{formatCost(totalStats.cost)}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
