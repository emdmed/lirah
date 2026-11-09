import { getContextFill, HEAVY_CONTEXT_TOKENS } from '../../config/models';
import { shortcutKeys } from '../../lib/shortcuts';
import { ContextPeek } from '../token-budget/ContextPeek';
import { useTokenBudget } from '../token-budget/TokenBudgetContext';
import { useTokenUsageValue } from '../token-budget/tokenUsageStore';
import { ZenDrawer } from './ZenDrawer';

// The context meter's peek (FIG.23 sources) in a drawer from the strip's moon.
export function ContextDrawer({ projectPath }) {
  return (
    <ZenDrawer id="context" title="context" keys={shortcutKeys('zen-context')} className="w-[28rem]">
      <ContextSources projectPath={projectPath} />
    </ZenDrawer>
  );
}

// Mounts only while open, so the usage subscription and session read run then.
function ContextSources({ projectPath }) {
  const { tokenUsageStore } = useTokenBudget();
  const tokenUsage = useTokenUsageValue(tokenUsageStore);
  const ctx = getContextFill(tokenUsage);
  // Same "crowded" rule as the status bar's context meter.
  const heavy = !!ctx && (ctx.used > HEAVY_CONTEXT_TOKENS || ctx.ratio >= 0.8);
  return <ContextPeek tokenUsage={tokenUsage} projectPath={projectPath} heavy={heavy} />;
}
