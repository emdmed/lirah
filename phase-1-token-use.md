# Phase 1: Token Budget & Alerts + Smart Context Warnings

## Overview

Implement per-project token budgets with real-time monitoring, visual status bar indicators, and pre-send cost estimation with warnings. This phase focuses on cost control and preventing overspending.

**Estimated Effort:** 8-10 tasks  
**Files Created:** 4 new files  
**Files Modified:** 3 existing files  

---

## Architecture

### Data Flow

```
TokenBudgetContext (global state)
    ├── reads from: ~/.claude/stats-cache.json
    ├── reads from: current session file
    ├── writes to: localStorage (budgets)
    └── provides to:
        ├── StatusBar (indicator)
        ├── TextareaPanel (cost estimate)
        └── TokenAlertBanner (alerts)
```

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `TokenBudgetContext` | State management, calculations, storage | `src/contexts/` |
| `TokenBudgetDialog` | Set/edit budget limits | `src/components/` |
| `TokenAlertBanner` | Display 80%/95% warnings | `src/components/` |
| `TokenCostEstimate` | Pre-send cost preview | `src/components/` |
| `StatusBar` (mod) | Add budget indicator & popup | `src/components/` |
| `App` (mod) | Integrate context | `src/` |
| `TextareaPanel` (mod) | Add cost estimate UI | `src/components/textarea-panel/` |

---

## Data Models

### Budget State Structure

```javascript
// TokenBudgetContext state
{
  projectBudgets: {
    "/home/user/projects/lirah": {
      dailyLimit: 100000,        // tokens per day
      weeklyLimit: 500000,       // tokens per week
      alertShown: {
        daily80: false,
        daily95: false,
        weekly80: false,
        weekly95: false
      },
      createdAt: 1707830400000,
      updatedAt: 1707830400000
    }
  },
  currentUsage: {
    "/home/user/projects/lirah": {
      daily: {
        input: 15234,
        output: 8921,
        cacheRead: 45678,
        cacheWrite: 1234,
        total: 24155,
        cost: 0.87
      },
      weekly: {
        input: 145000,
        output: 89000,
        cacheRead: 234000,
        cacheWrite: 12000,
        total: 234000,
        cost: 8.45
      }
    }
  }
}
```

### Pricing Configuration

```javascript
// src/config/pricing.js
export const ANTHROPIC_PRICING = {
  models: {
    'claude-opus-4-6': { input: 15.0, output: 75.0 },
    'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
    'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 }
  },
  cacheReadDiscount: 0.25,      // Cache reads cost 25% of normal
  cacheCreationPremium: 1.25    // Cache writes cost 1.25x
};

export function calculateCost(usage, model) {
  const pricing = ANTHROPIC_PRICING.models[model] || ANTHROPIC_PRICING.models['claude-sonnet-4-5-20250929'];
  
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = (usage.cacheReadInputTokens / 1_000_000) * pricing.input * ANTHROPIC_PRICING.cacheReadDiscount;
  const cacheCreateCost = (usage.cacheCreationInputTokens / 1_000_000) * pricing.input * ANTHROPIC_PRICING.cacheCreationPremium;
  
  return inputCost + outputCost + cacheReadCost + cacheCreateCost;
}
```

---

## Implementation Order

### Task 1: Create Pricing Configuration

**File:** `src/config/pricing.js`

Create the pricing module with Anthropic's current rates and cost calculation functions.

### Task 2: Create TokenBudgetContext

**File:** `src/contexts/TokenBudgetContext.jsx`

**Responsibilities:**
- Load budgets from localStorage on mount
- Parse stats-cache.json for historical usage
- Poll current session for real-time usage
- Calculate daily/weekly totals
- Manage alert states (80%, 95%)
- Provide budget check functions

**Key Methods:**
```javascript
- getBudget(projectPath) -> budget object
- setBudget(projectPath, dailyLimit, weeklyLimit)
- getCurrentUsage(projectPath) -> usage object
- checkBudgetStatus(projectPath) -> { status: 'ok'|'warning'|'critical', percentage }
- resetAlerts(projectPath)
- estimateCost(tokens, model) -> cost
```

**Storage Key:** `lirah:token-budgets:v1`

### Task 3: Create TokenBudgetDialog

**File:** `src/components/TokenBudgetDialog.jsx`

**UI Elements:**
- Header: "Token Budget Settings"
- Current project path display
- Daily limit input (number, tokens)
- Weekly limit input (number, tokens)
- Current usage display (progress bars)
- Cost preview: "At current rates, 100k tokens ≈ $X"
- Save/Cancel buttons
- Reset alerts button (if alerts triggered)

**Validation:**
- Daily limit must be < weekly limit
- Min: 1000 tokens
- Max: 10,000,000 tokens

### Task 4: Modify StatusBar Component

**File:** `src/components/StatusBar.jsx`

**Additions:**
- Budget indicator (right side, before theme toggle)
- Progress bar showing daily usage %
- Color coding: green (<80%), yellow (80-94%), red (≥95%)
- Click to open popup

**Popup Content:**
- Daily progress bar with numbers: "45,234 / 100,000 (45%)"
- Weekly progress bar
- Cost estimate: "$0.87 today"
- "Budget Settings" button
- Close on click outside or Escape

### Task 5: Create TokenAlertBanner

**File:** `src/components/TokenAlertBanner.jsx`

**Behavior:**
- Fixed position: top of app, below title bar
- Yellow variant (80%): "Approaching daily token budget (80%) - Click to adjust"
- Red variant (95%): "Daily token budget nearly exhausted (95%)! Sending paused."
- Dismissible with X button
- Auto-show when threshold crossed
- Don't show again until reset or next day

**Positioning:**
```css
position: fixed;
top: 32px; /* Below title bar */
left: 0;
right: 0;
z-index: 50;
```

### Task 6: Create TokenCostEstimate Component

**File:** `src/components/TokenCostEstimate.jsx`

**Purpose:** Estimate token cost before sending prompt

**Calculation:**
1. Get selected files from FileSelectionContext
2. Calculate tokens using same logic as compact feature:
   - Files <300 lines: path only (~10 tokens)
   - Files 300-799 lines: signatures (~200 tokens)
   - Files 800+ lines: skeleton (~500 tokens)
3. Add textarea content length / 4
4. Add system overhead (~500 tokens)
5. Multiply by 1.2 for output estimate

**Display:**
- "Est: ~2,450 tokens ($0.08)"
- Warning style if exceeds remaining budget
- Tooltip showing breakdown

### Task 7: Modify TextareaPanel

**File:** `src/components/textarea-panel/TextareaPanel.jsx`

**Changes:**
- Import TokenCostEstimate
- Add below textarea, left-aligned
- Pass selected files as prop
- Disable send button if budget exhausted (≥100%)
- Show warning tooltip on hover when >80%

### Task 8: Integrate into App.jsx

**File:** `src/App.jsx`

**Changes:**
- Import TokenBudgetProvider
- Wrap app with provider
- Import TokenAlertBanner
- Render banner conditionally based on context
- Add keyboard shortcut Ctrl+Shift+B for budget dialog

### Task 9: Create Usage Calculation Utilities

**File:** `src/utils/tokenCalculations.js`

**Functions:**
```javascript
- parseStatsCache(projectPath) -> daily/weekly usage
- parseCurrentSession(projectPath) -> current session usage
- aggregateUsage(statsData, sessionData) -> combined usage
- getStartOfDay() -> timestamp
- getStartOfWeek() -> timestamp
- formatTokenCount(number) -> "12.5K"
- formatCost(number) -> "$0.87"
```

### Task 10: Testing & Polish

**Test Scenarios:**
1. Set budget → verify saved to localStorage
2. Use tokens → verify indicator updates
3. Reach 80% → verify yellow banner appears
4. Reach 95% → verify red banner appears + send disabled
5. New day → verify counters reset
6. Switch projects → verify project-specific budgets

**Edge Cases:**
- No budget set (show "Set Budget" button)
- Missing stats-cache.json (show loading state)
- Invalid localStorage data (reset to defaults)

---

## UI Specifications

### Status Bar Indicator

```
[StatusBar Content...]  [Token: ████████░░ 45% $0.87]  [Theme]  [Settings]
                         Green bar: <80%
                         Yellow bar: 80-94%
                         Red bar: ≥95%
```

**Click opens popup:**
```
┌──────────────────────────────┐
│ Token Budget                 │
├──────────────────────────────┤
│ Today                        │
│ ████████████░░░░░░░░ 45%     │
│ 45,234 / 100,000 tokens      │
│ Cost: $0.87                  │
├──────────────────────────────┤
│ This Week                    │
│ ██████░░░░░░░░░░░░ 23%       │
│ 234,000 / 1,000,000 tokens   │
│ Cost: $8.45                  │
├──────────────────────────────┤
│ [Budget Settings]            │
└──────────────────────────────┘
```

### Token Alert Banner

**Yellow (80%):**
```
┌────────────────────────────────────────────────────────────┐
│ ⚠️  Approaching daily token budget (80%)           [×]     │
│     Click to adjust your budget settings                   │
└────────────────────────────────────────────────────────────┘
Background: yellow-500/20, Border: yellow-500, Text: yellow-700
```

**Red (95%):**
```
┌────────────────────────────────────────────────────────────┐
│ 🛑 Daily token budget nearly exhausted (95%)!      [×]     │
│     Sending paused. Click to adjust settings.              │
└────────────────────────────────────────────────────────────┘
Background: red-500/20, Border: red-500, Text: red-700
```

### Cost Estimate in TextareaPanel

```
┌─────────────────────────────────────────────────────────┐
│ [Textarea content...]                                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Est: ~2,450 tokens ($0.08)  [Send Ctrl+Enter]          │
│ └─ Green text normally                                  │
│ └─ Yellow when >80% remaining budget                    │
│ └─ Red when >100% remaining budget                      │
└─────────────────────────────────────────────────────────┘
```

---

## LocalStorage Schema

```json
{
  "version": 1,
  "budgets": {
    "/home/user/projects/lirah": {
      "dailyLimit": 100000,
      "weeklyLimit": 500000,
      "createdAt": "2024-02-14T10:30:00Z",
      "updatedAt": "2024-02-14T10:30:00Z"
    }
  },
  "alertStates": {
    "/home/user/projects/lirah": {
      "daily80": "2024-02-14",
      "daily95": "2024-02-14",
      "weekly80": null,
      "weekly95": null
    }
  }
}
```

---

## Performance Considerations

1. **Stats Cache Parsing:** Parse `stats-cache.json` once on context mount, not on every render
2. **Session Polling:** Continue using existing 5-second interval from useTokenUsage hook
3. **Calculation Caching:** Memoize cost calculations in useMemo
4. **Storage:** Debounce localStorage writes (300ms)

---

## Dependencies

No new dependencies required for Phase 1.

Uses existing:
- React context
- Tauri API (for file reading)
- date-fns (if available, or use native Date)

---

## Success Criteria

- [ ] User can set daily and weekly token budgets per project
- [ ] Status bar shows real-time budget usage with color coding
- [ ] 80% warning banner appears and is dismissible
- [ ] 95% critical banner appears and disables sending
- [ ] Cost estimate shown before sending prompts
- [ ] All data persists across app restarts
- [ ] Budgets reset appropriately for new day/week
