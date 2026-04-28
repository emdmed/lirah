import { useState } from "react";
import { Trash2, Settings } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

export function OrchestrationToggle({ appendOrchestration, onToggleOrchestration, orchestrationTokenEstimate, disabled, isWide, onDeleteOrchestration, onOpenDashboard }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!onToggleOrchestration) return null;

  const trashButton = onDeleteOrchestration && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 w-5 p-0 opacity-40 hover:opacity-100 hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">Remove .orchestration/ from project</span>
      </TooltipContent>
    </Tooltip>
  );

  const dashboardButton = onOpenDashboard && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 w-5 p-0 opacity-40 hover:opacity-100"
          onClick={onOpenDashboard}
        >
          <Settings className="w-3 h-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">Orchestration dashboard</span>
      </TooltipContent>
    </Tooltip>
  );

  const confirmDialog = (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="sm:max-w-[420px] border-destructive/30 border-sketch bg-destructive/5">
        <DialogHeader className="gap-3">
          <DialogTitle className="text-base font-semibold">
            Delete Orchestration?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            This will permanently delete the <code className="text-xs bg-secondary/50 px-1 rounded-sm">.orchestration/</code> directory from this project. The orchestration protocol will no longer run for this project.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 sm:justify-end mt-4">
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} className="border-sketch">
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirmOpen(false);
              onDeleteOrchestration();
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isWide) {
    return (
      <>
        {confirmDialog}
        <div className=" border border-sketch p-2">
          <h4 className="text-xs font-medium text-primary mb-1 flex items-center gap-1.5">
            <Checkbox
              id="orchestration-wide"
              checked={appendOrchestration}
              onCheckedChange={onToggleOrchestration}
              disabled={disabled}
              className="border-primary/50"
            />
            <label htmlFor="orchestration-wide" className="cursor-pointer select-none flex-1">
              Orchestration
            </label>
            {dashboardButton}
            {trashButton}
          </h4>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Double-tap Ctrl to toggle</span>
            <span className="text-[10px] text-muted-foreground/60">
              {appendOrchestration && orchestrationTokenEstimate != null
                ? `+${orchestrationTokenEstimate.toLocaleString()} tokens`
                : ''}
            </span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {confirmDialog}
      <div className="flex items-center gap-3 bg-secondary/20 rounded-none px-2 py-1">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="orchestration"
                  checked={appendOrchestration}
                  onCheckedChange={onToggleOrchestration}
                  disabled={disabled}
                />
                <label htmlFor="orchestration" className="text-muted-foreground cursor-pointer select-none text-xs">
                  orchestration
                  {appendOrchestration && orchestrationTokenEstimate != null && (
                    <span className="text-muted-foreground/60 ml-1">(~{orchestrationTokenEstimate.toLocaleString()})</span>
                  )}
                </label>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="text-xs">
                {appendOrchestration && orchestrationTokenEstimate != null
                  ? `Adds ~${orchestrationTokenEstimate.toLocaleString()} tokens to prompt`
                  : 'Enable to append orchestration context'}
              </span>
            </TooltipContent>
          </Tooltip>
          {dashboardButton}
          {trashButton}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/40 text-[10px] cursor-help">Ctrl+Ctrl</span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="text-xs">Double-tap Ctrl to toggle</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
