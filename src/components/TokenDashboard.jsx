import { useState, useMemo, useEffect, lazy, Suspense, useCallback } from 'react';
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
import { Download, FileSpreadsheet, FileJson, RefreshCw, FileText, BarChart3 } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { TokenLineChart } from './token-dashboard/TokenLineChart';
import { SessionEfficiencyPanel } from './token-dashboard/SessionEfficiencyPanel';
import { UsageSummaryPanel } from './token-dashboard/UsageSummaryPanel';
import { prepareChartData, calculateEfficiencyMetrics, prepareModelBreakdown, computeCost } from '../utils/dashboardData';
import { exportToCSV, exportToJSON } from '../utils/exportData';
import { formatCost } from '../utils/tokenCalculations';
import { scanAllProjects, getAllSessions } from '../utils/projectScanner';

const ProjectComparison = lazy(() => import('./token-dashboard/ProjectComparison').then(m => ({ default: m.ProjectComparison })));
const HistoricalBrowser = lazy(() => import('./token-dashboard/HistoricalBrowser').then(m => ({ default: m.HistoricalBrowser })));
const ModelInsights = lazy(() => import('./token-dashboard/ModelInsights').then(m => ({ default: m.ModelInsights })));
const ExportReportDialog = lazy(() => import('./ExportReportDialog').then(m => ({ default: m.ExportReportDialog })));

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects' },
  { id: 'history', label: 'History' },
  { id: 'insights', label: 'Insights' },
];

export function TokenDashboard({ open, onOpenChange, tokenUsage, projectStats, refreshStats, projectPath, theme }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('daily');
  const [selectedModel, setSelectedModel] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [allProjectsData, setAllProjectsData] = useState(null);
  const [allProjectsLoading, setAllProjectsLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [showCacheTokens, setShowCacheTokens] = useState(false);

  // Defer heavy content rendering until after the dialog shell has painted.
  // Double rAF ensures the browser completes a full paint cycle before mounting charts.
  useEffect(() => {
    if (open) {
      let cancelled = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setContentReady(true);
        });
      });
      return () => { cancelled = true; };
    } else {
      setContentReady(false);
    }
  }, [open]);

  // Prefetch all projects data when dialog opens
  useEffect(() => {
    if (open) {
      if (refreshStats) refreshStats();
      if (!allProjectsData && !allProjectsLoading) {
        setAllProjectsLoading(true);
        scanAllProjects().then(data => {
          setAllProjectsData(data);
          setAllProjectsLoading(false);
        }).catch(() => setAllProjectsLoading(false));
      }
    }
  }, [open]);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    if (refreshStats) refreshStats();
    if (activeTab !== 'overview') {
      scanAllProjects(true).then(data => {
        setAllProjectsData(data);
        setRefreshing(false);
      }).catch(() => setRefreshing(false));
    } else {
      setTimeout(() => setRefreshing(false), 500);
    }
  }, [refreshStats, refreshing, activeTab]);

  const statsCache = useMemo(() => {
    if (!projectStats) return { dailyActivity: [] };
    return { dailyActivity: projectStats.daily_activity || [] };
  }, [projectStats]);

  const modelBreakdown = useMemo(() => prepareModelBreakdown(statsCache), [statsCache]);

  const filteredStatsCache = useMemo(() => {
    if (selectedModel === 'all' || !projectStats?.daily_activity) return statsCache;
    return {
      dailyActivity: projectStats.daily_activity.filter(d =>
        d.model?.toLowerCase().includes(selectedModel.toLowerCase())
      ),
    };
  }, [statsCache, selectedModel, projectStats]);

  const chartData = useMemo(() => prepareChartData(filteredStatsCache, timeRange), [filteredStatsCache, timeRange]);
  const efficiencyMetrics = useMemo(() => calculateEfficiencyMetrics(filteredStatsCache, tokenUsage), [filteredStatsCache, tokenUsage]);

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

  const allSessions = useMemo(() => getAllSessions(allProjectsData), [allProjectsData]);
  const allProjectNames = useMemo(() => allProjectsData?.projects?.map(p => p.name) || [], [allProjectsData]);
  const allModels = useMemo(() => {
    const models = new Set();
    allSessions.forEach(s => { if (s.model) models.add(s.model); });
    return [...models];
  }, [allSessions]);

  const handleExportCSV = () => exportToCSV(chartData, timeRange);
  const handleExportJSON = () => exportToJSON(chartData, timeRange, {
    project: projectPath,
    totalCost: totalStats.cost,
    models: projectStats?.models || [],
  });

  const t = theme?.terminal || {};
  const chartColors = {
    input: t.blue,
    output: t.green,
    cacheRead: t.magenta,
    text: t.foreground,
    grid: t.black,
    red: t.red,
    yellow: t.yellow,
    cyan: t.cyan,
  };

  const formatModelName = (model) => {
    if (!model) return 'Unknown';
    const m = model.toLowerCase();
    if (m.includes('opus-4-6') || m.includes('opus-4.6')) return 'Opus 4.6';
    if (m.includes('opus-4-5') || m.includes('opus-4.5')) return 'Opus 4.5';
    if (m.includes('opus')) return 'Opus';
    if (m.includes('sonnet-4-5') || m.includes('sonnet-4.5')) return 'Sonnet 4.5';
    if (m.includes('sonnet')) return 'Sonnet';
    return model;
  };

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
      <RefreshCw size={14} className="animate-spin mr-2" />
      Loading...
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] h-[92vh] max-w-[1400px] max-h-[900px] p-0 flex flex-col overflow-hidden font-mono" instant>
        <DialogHeader className="px-4 py-3 pr-10 border-b border-sketch shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Token Usage Dashboard
            </DialogTitle>
            <div className="flex items-center gap-2">
              {/* Main tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8">
                  {TABS.map(tab => (
                    <TabsTrigger key={tab.id} value={tab.id} className="text-xs px-3 font-mono">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Time range tabs (overview only) */}
              {activeTab === 'overview' && (
                <Tabs value={timeRange} onValueChange={setTimeRange}>
                  <TabsList className="h-8">
                    <TabsTrigger value="daily" className="text-xs px-3 font-mono">Daily</TabsTrigger>
                    <TabsTrigger value="weekly" className="text-xs px-3 font-mono">Weekly</TabsTrigger>
                    <TabsTrigger value="monthly" className="text-xs px-3 font-mono">Monthly</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

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
                  {allProjectsData && (
                    <DropdownMenuItem onClick={() => setExportDialogOpen(true)} className="gap-2 text-xs font-mono">
                      <FileText size={12} />
                      Advanced Export...
                    </DropdownMenuItem>
                  )}
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
          {!contentReady && <LoadingSpinner />}
          {/* Overview Tab */}
          {contentReady && activeTab === 'overview' && !projectStats && (
            <LoadingSpinner />
          )}
          {contentReady && activeTab === 'overview' && projectStats && (
            <>
              {projectStats.models && projectStats.models.length > 0 && (
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

              <div className="flex-1 grid grid-cols-3 gap-3 min-h-0">
                <div className="col-span-2 bg-background rounded border border-sketch p-3 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="text-xs font-medium">Token Usage Over Time</div>
                    <Button
                      variant={showCacheTokens ? 'default' : 'outline'}
                      size="sm"
                      className="h-5 text-[10px] px-1.5"
                      onClick={() => setShowCacheTokens(v => !v)}
                    >
                      Cache
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <TokenLineChart data={chartData} timeRange={timeRange} colors={chartColors} showCache={showCacheTokens} />
                  </div>
                </div>

                <div className="flex flex-col gap-3 min-h-0 overflow-auto">
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
                            <div className="text-muted-foreground" style={{ fontSize: 'var(--font-xs)' }}>
                              {(mb.tokens / 1000).toFixed(1)}k tokens
                            </div>
                          </div>
                        </div>
                      ))}
                      {modelBreakdown.length === 0 && (
                        <EmptyState
                          icon={BarChart3}
                          title="No model data yet"
                          description="Start using Claude Code to see token usage analytics by model"
                          className="py-4"
                        />
                      )}
                    </div>
                  </div>
                  <UsageSummaryPanel sessionData={currentSessionData} tokenUsage={tokenUsage} colors={chartColors} />
                  <SessionEfficiencyPanel metrics={efficiencyMetrics} colors={chartColors} />
                </div>
              </div>

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
            </>
          )}

          {/* Projects Tab */}
          {contentReady && activeTab === 'projects' && (
            <div className="flex-1 min-h-0">
              {allProjectsLoading ? (
                <LoadingSpinner />
              ) : (
                <Suspense fallback={<LoadingSpinner />}>
                  <ProjectComparison
                    projects={allProjectsData?.projects || []}
                    totals={allProjectsData?.totals}
                    colors={chartColors}
                  />
                </Suspense>
              )}
            </div>
          )}

          {/* History Tab */}
          {contentReady && activeTab === 'history' && (
            <div className="flex-1 min-h-0">
              {allProjectsLoading ? (
                <LoadingSpinner />
              ) : (
                <Suspense fallback={<LoadingSpinner />}>
                  <HistoricalBrowser
                    sessions={allSessions}
                    projects={allProjectNames}
                    models={allModels}
                    colors={chartColors}
                  />
                </Suspense>
              )}
            </div>
          )}

          {/* Insights Tab */}
          {contentReady && activeTab === 'insights' && (
            <div className="flex-1 min-h-0">
              {allProjectsLoading ? (
                <LoadingSpinner />
              ) : (
                <Suspense fallback={<LoadingSpinner />}>
                  <ModelInsights
                    sessions={allSessions}
                    projects={allProjectsData?.projects || []}
                    colors={chartColors}
                  />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Advanced Export Dialog */}
      {exportDialogOpen && (
        <Suspense fallback={null}>
          <ExportReportDialog
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
            sessions={allSessions}
            projects={allProjectsData?.projects || []}
          />
        </Suspense>
      )}
    </Dialog>
  );
}
