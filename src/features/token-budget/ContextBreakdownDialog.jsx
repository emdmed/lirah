import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ContextBreakdown } from './token-dashboard/ContextBreakdown';

// Full breakdown of what fills the tab's context window, opened from the
// context meter's Details button.
export function ContextBreakdownDialog({ open, onOpenChange, tokenUsage, projectPath, theme }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        lamp="on"
        className="max-w-[1200px] max-h-[820px] p-0 flex flex-col gap-0 overflow-hidden font-mono"
        instant
      >
        <DialogTitle>Context</DialogTitle>
        <DialogDescription className="sr-only">What fills this tab's context window, by source, piece and file.</DialogDescription>
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <ContextBreakdown tokenUsage={tokenUsage} projectPath={projectPath} palette={theme?.terminal} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
