# Phase 3: Project Cost Tracking + Historical Browser

## Overview

Advanced analytics including cross-project comparison, historical data browser with filtering, and model usage insights with cost optimization recommendations. This phase provides comprehensive visibility into long-term usage patterns.

**Estimated Effort:** 8-10 tasks  
**Files Created:** 5 new files  
**Files Modified:** 2 existing files  
**New Dependencies:** None (uses Phase 2 dependencies)

**Prerequisites:** Phase 1 and Phase 2 must be complete

---

## Architecture

### New Components

```
TokenDashboard (extended)
├── [Existing tabs: Daily, Weekly, Monthly]
├── [NEW] ProjectsTab
│   └── ProjectComparisonTable
├── [NEW] HistoryTab
│   ├── DateRangePicker
│   ├── CalendarHeatmap
│   └── SessionDetailList
└── [NEW] InsightsTab
    └── ModelInsightsPanel
```

### Data Flow

```
All Projects Scan (~/.claude/projects/)
    ├── Parse each project's stats-cache.json
    ├── Aggregate into projectSummaries
    └── Cache in TokenBudgetContext

Historical Browser
    ├── Date range selection
    ├── Filter by project/model
    ├── Load session files on demand
    └── Display in list/calendar view

Model Insights
    ├── Aggregate all model usage
    ├── Calculate cost differences
    ├── Generate recommendations
    └── Display savings opportunities
```

---

## Implementation Order

### Task 1: Create Project Scanner Utility

**File:** `src/utils/projectScanner.js`

**Purpose:** Scan all projects in ~/.claude/projects/ and aggregate data

**Function Signature:**
```javascript
async function scanAllProjects() -> {
  projects: [
    {
      path: "/home/user/projects/lirah",
      name: "lirah",
      totalTokens: 1234567,
      totalCost: 45.20,
      sessionCount: 45,
      messageCount: 890,
      lastActivity: "2024-02-14",
      dailyAverage: 2345,
      modelSplit: {
        'claude-opus-4-6': 0.4,
        'claude-sonnet-4-5-20250929': 0.6
      }
    }
  ],
  totals: {
    allProjectsTokens: 5678901,
    allProjectsCost: 234.50,
    totalSessions: 234
  }
}
```

**Implementation Notes:**
- Read ~/.claude/projects/ directory
- For each project, parse stats-cache.json
- Aggregate data into summary objects
- Cache results for 5 minutes
- Handle missing/invalid files gracefully

### Task 2: Create ProjectComparison Component

**File:** `src/components/token-dashboard/ProjectComparison.jsx`

**UI: Data Table**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Project Comparison                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ [All Time] [Last 30 Days] [Last 7 Days]         [Sort ▼] [Filter]  │
├─────────────────────────────────────────────────────────────────────┤
│ Project        │ Tokens   │ Cost   │ Sessions │ Msgs   │ Avg/Day  │
├─────────────────────────────────────────────────────────────────────┤
│ lirah          │ 1.2M     │ $45.20 │ 45       │ 890    │ 2,345    │
│ zenit-ehr      │ 890K     │ $32.10 │ 34       │ 567    │ 1,890    │
│ tradingbot     │ 2.1M     │ $78.50 │ 89       │ 1234   │ 4,567    │
│ ...            │ ...      │ ...    │ ...      │ ...    │ ...      │
├─────────────────────────────────────────────────────────────────────┤
│ Total          │ 4.2M     │ $155.80│ 168      │ 2691   │ 8,802    │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Sortable columns (click header)
- Sparkline chart for each project (mini trend)
- Row hover: show action buttons (Open, View Details)
- Click row: navigate to project
- Filter by name search
- Time range selector affects all data

**Sorting Options:**
- Tokens (high/low)
- Cost (high/low)
- Sessions (high/low)
- Last activity (recent/oldest)
- Name (A-Z)

### Task 3: Create Historical Browser

**File:** `src/components/token-dashboard/HistoricalBrowser.jsx`

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Historical Browser                                          [Help] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Date Range: [From: 2024-01-01 ▼] [To: 2024-02-14 ▼]  [Apply]      │
│                                                                     │
│  Filters: [All Projects ▼] [All Models ▼]           [Reset]        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Calendar Heatmap (GitHub-style)                             │   │
│  │                                                             │   │
│  │ Less ████ ████ ████ ████ ████ ████ ████ ████ ████ More     │   │
│  │      ████ ████ ████ ████ ████ ████ ████ ████ ████          │   │
│  │      ████ ████ ████ ████ ████ ████ ████ ████ ████          │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Sessions (45 found)                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ▶ Feb 14, 2024 - 10:30 AM  │ 1,234 tokens │ $0.45 │ lirah   │   │
│  │   Model: Opus 4.6 │ 12 messages │ 45 min duration            │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ ▶ Feb 14, 2024 - 09:15 AM  │  567 tokens │ $0.21 │ zenit   │   │
│  │   Model: Sonnet 4.5 │ 8 messages │ 30 min duration            │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ ▶ Feb 13, 2024 - 05:30 PM  │ 2,890 tokens │ $1.12 │ lirah   │   │
│  │   Model: Opus 4.6 │ 23 messages │ 120 min duration           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More...]                                          Page 1/5   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Calendar Heatmap:**
- Show last 12 months
- Color intensity based on token usage
- Hover: show date + total tokens + cost
- Click: filter sessions to that day
- Use `date-fns` for calendar generation

**Session List:**
- Expandable rows
- Show: date, time, project, tokens, cost, model, duration, messages
- Pagination: 20 items per page
- Sort by: date (default), tokens, cost

### Task 4: Create Date Range Picker

**File:** `src/components/ui/DateRangePicker.jsx`

**Reusable component for selecting date ranges**

**Features:**
- Presets: "Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "All Time"
- Custom range: From/To date inputs
- Calendar popup for date selection
- Validation: To date must be after From date
- Max range: 1 year

### Task 5: Create Model Insights Panel

**File:** `src/components/token-dashboard/ModelInsights.jsx`

**Purpose:** Analyze model usage and suggest cost optimizations

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Model Usage Insights                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────┐  ┌───────────────────────────────┐│
│  │ Model Distribution          │  │ Cost Analysis                 ││
│  │                             │  │                               ││
│  │     [Donut Chart]           │  │ Opus:    40% │ $89.20        ││
│  │                             │  │ Sonnet:  60% │ $23.40        ││
│  │  Opus:  40% (45 sessions)   │  │                               ││
│  │  Sonnet: 60% (89 sessions)  │  │ Total: $112.60               ││
│  │                             │  │                               ││
│  └─────────────────────────────┘  └───────────────────────────────┘│
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 💡 Optimization Recommendations                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🟢 Low Priority                                                    │
│  • Switching Session X to Sonnet could have saved $0.45            │
│                                                                     │
│  🟡 Medium Priority                                                 │
│  • 3 sessions used Opus for simple tasks (est. savings: $2.30)     │
│                                                                     │
│  🔴 High Priority                                                   │
│  • Consider Sonnet for routine tasks in lirah project              │
│    (project average: 89% Opus usage, potential monthly savings:    │
│    $23.40)                                                          │
│                                                                     │
│  [Learn more about model selection]                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Analysis Logic:**

```javascript
// Identify optimization opportunities
const insights = {
  // Sessions where Opus was used but might have been Sonnet
  overkillSessions: sessions.filter(s => {
    return s.model.includes('opus') &&
           s.toolCallCount < 5 &&          // Simple tasks
           s.messageCount < 10 &&          // Short conversations
           s.outputTokens < 2000;          // Small outputs
  }),
  
  // Calculate potential savings
  potentialSavings: overkillSessions.reduce((sum, s) => {
    const opusCost = calculateCost(s, 'opus');
    const sonnetCost = calculateCost(s, 'sonnet');
    return sum + (opusCost - sonnetCost);
  }, 0),
  
  // Model by project analysis
  projectRecommendations: projects.map(p => ({
    project: p.name,
    opusPercentage: p.opusUsage / p.totalUsage,
    recommendation: p.opusPercentage > 0.7 
      ? 'Consider more Sonnet usage'
      : 'Good model balance'
  }))
};
```

### Task 6: Create Export Report Dialog

**File:** `src/components/ExportReportDialog.jsx`

**Purpose:** Advanced export with filtering and formatting options

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ Export Usage Report                             [×]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Format: (•) CSV  ( ) JSON  ( ) PDF                    │
│                                                         │
│  Date Range:                                            │
│  [From: 2024-01-01 ▼] [To: 2024-02-14 ▼]               │
│                                                         │
│  Include:                                               │
│  [✓] All Projects      [✓] Token details              │
│  [✓] Cost breakdown    [✓] Model usage                │
│  [✓] Session metadata  [ ] Raw message data           │
│                                                         │
│  Aggregation: [By Day ▼]                                │
│                                                         │
│  [Cancel]                                [Export]      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**PDF Option:** Generate simple PDF report with charts (optional stretch goal)

### Task 7: Extend TokenDashboard with New Tabs

**File:** `src/components/TokenDashboard.jsx` (modification)

**Add Tab Navigation:**
```javascript
const tabs = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'projects', label: 'Projects' },      // NEW
  { id: 'history', label: 'History' },         // NEW
  { id: 'insights', label: 'Insights' }        // NEW
];
```

**Lazy Loading:** Use React.lazy() for new tab components to reduce initial load

### Task 8: Create Data Caching Layer

**File:** `src/utils/dataCache.js`

**Purpose:** Cache scanned project data to avoid re-reading files

```javascript
const cache = {
  projects: {
    data: null,
    timestamp: null,
    ttl: 5 * 60 * 1000  // 5 minutes
  },
  sessions: new Map(),  // sessionId -> { data, timestamp }
  
  getProjects() { ... },
  setProjects(data) { ... },
  isValid(timestamp) { ... },
  clear() { ... }
};
```

### Task 9: Add Advanced Filtering

**File:** `src/components/token-dashboard/FilterPanel.jsx`

**Filters:**
- Date range (reusable component)
- Project(s) multi-select
- Model(s) multi-select
- Token amount range (min/max)
- Cost range (min/max)
- Session duration (short <15min, medium, long >60min)

**Filter Logic:**
```javascript
function filterSessions(sessions, filters) {
  return sessions.filter(s => {
    if (filters.projects.length && !filters.projects.includes(s.project)) return false;
    if (filters.models.length && !filters.models.includes(s.model)) return false;
    if (s.tokens < filters.minTokens || s.tokens > filters.maxTokens) return false;
    if (s.cost < filters.minCost || s.cost > filters.maxCost) return false;
    return true;
  });
}
```

### Task 10: Testing & Integration

**Integration Testing:**
1. Verify project scanning works with 10+ projects
2. Test calendar heatmap with 1 year of data
3. Verify filters work correctly
4. Test export with large datasets (1000+ sessions)
5. Verify insights calculations are accurate

**Performance Testing:**
- Initial dashboard load < 2 seconds
- Tab switching < 500ms
- Filter application < 1 second
- Export generation < 3 seconds

---

## Data Processing Details

### Scanning All Projects

```javascript
async function scanAllProjects() {
  const home = await homeDir();
  const projectsDir = `${home}/.claude/projects`;
  
  const entries = await readDir(projectsDir);
  const projects = [];
  
  for (const entry of entries) {
    if (entry.isDirectory) {
      const statsPath = `${projectsDir}/${entry.name}/stats-cache.json`;
      try {
        const stats = await readTextFile(statsPath);
        const data = JSON.parse(stats);
        projects.push(aggregateProjectData(entry.name, data));
      } catch (e) {
        // Skip projects with missing/invalid stats
      }
    }
  }
  
  return projects;
}
```

### Calendar Heatmap Data

```javascript
function generateCalendarData(sessions, year) {
  const days = eachDayOfInterval({
    start: startOfYear(year),
    end: endOfYear(year)
  });
  
  return days.map(day => {
    const daySessions = sessions.filter(s => 
      isSameDay(parseISO(s.date), day)
    );
    
    const totalTokens = daySessions.reduce((sum, s) => sum + s.tokens, 0);
    
    return {
      date: day,
      count: daySessions.length,
      tokens: totalTokens,
      level: getIntensityLevel(totalTokens) // 0-4
    };
  });
}
```

---

## UI Specifications

### Calendar Heatmap

- **Cell size:** 12x12px
- **Gap:** 2px
- **Colors (GitHub-style):**
  - Level 0: #ebedf0 (gray-100)
  - Level 1: #9be9a8 (green-200)
  - Level 2: #40c463 (green-400)
  - Level 3: #30a14e (green-600)
  - Level 4: #216e39 (green-800)
- **Tooltip:** "Feb 14, 2024: 1,234 tokens ($0.45)"
- **Months:** Show month labels above grid
- **Weekdays:** Show M/W/F labels on left

### Project Comparison Table

- **Row height:** 48px
- **Hover:** bg-gray-50
- **Selected:** bg-blue-50 with border
- **Sparkline:** 100x20px, stroke only
- **Sorting:** Arrow indicator (▲▼) in header

### Session List Item

```
┌─────────────────────────────────────────────────────────────┐
│ ▶ Feb 14, 10:30 AM                                [Open]   │
│   lirah │ Opus 4.6 │ 1,234 tokens │ $0.45 │ 12 msgs │ 45m   │
└─────────────────────────────────────────────────────────────┘
```

Expand to show:
- Full message log preview
- Tool calls used
- Files referenced
- Export this session button

---

## Performance Optimizations

1. **Virtual Scrolling:** Use `react-window` for long session lists (1000+ items)
2. **Lazy Image Loading:** Calendar heatmap only render visible months
3. **Debounced Search:** Project filter debounced 300ms
4. **Memoization:** Cache filtered results with useMemo
5. **Background Loading:** Scan projects in background, show loading state

---

## Error Handling

- **No projects:** "No projects found in ~/.claude/projects"
- **Permission error:** "Cannot access Claude data directory"
- **Corrupted data:** "Some project data could not be loaded"
- **Timeout:** "Taking longer than expected... [Retry]"

---

## Success Criteria

- [ ] Project comparison table displays all projects with accurate data
- [ ] Calendar heatmap renders 12 months of activity
- [ ] Session list supports pagination and filtering
- [ ] Model insights show actionable recommendations
- [ ] Export generates valid CSV/JSON with all selected data
- [ ] Date range picker works across all tabs
- [ ] Filters persist across tab switches
- [ ] Performance: <2s initial load, <500ms tab switch
- [ ] Handles 50+ projects and 1000+ sessions smoothly
- [ ] All calculations verified accurate against raw data
