import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RetroSpinner } from "@/components/ui/RetroSpinner";

export function OrchestrationPrompt({
  open,
  onOpenChange,
  status,
  onInstall,
  installing
}) {
  const isMissing = status === 'missing';
  const isOutdated = status === 'outdated';

  const title = isMissing
    ? "Agentic Orchestration Not Installed"
    : "Agentic Orchestration Outdated";

  const description = isMissing
    ? "Agentic orchestration is not set up for this project. Install now?"
    : "Agentic orchestration files are outdated. Update now?";

  const buttonText = isMissing ? "Install" : "Update";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent instant className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={installing}
          >
            Skip
          </Button>
          <Button
            onClick={onInstall}
            disabled={installing}
            className="min-w-[80px]"
          >
            {installing ? (
              <RetroSpinner size="sm" />
            ) : (
              buttonText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
