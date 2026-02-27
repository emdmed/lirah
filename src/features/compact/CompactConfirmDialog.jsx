import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Layers, AlertTriangle, Info } from "lucide-react";

/**
 * Confirmation dialog for project compact operation
 * Shows file count, token estimate, compression ratio, and asks for confirmation
 */
export function CompactConfirmDialog({
  open,
  onOpenChange,
  fileCount,
  tokenEstimate,
  formattedTokens,
  originalTokens,
  formattedOriginalTokens,
  compressionPercent,
  onConfirm,
  onCancel,
}) {
  const isLarge = tokenEstimate > 50000; // Warn if over 50K tokens

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Compact Project
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Files parsed:</span>
                <span className="font-mono font-medium">{fileCount}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Original size:</span>
                <span className="font-mono font-medium text-muted-foreground">
                  ~{formattedOriginalTokens} tokens
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Compacted size:</span>
                <span className={`font-mono font-medium ${isLarge ? 'text-yellow-500' : 'text-green-500'}`}>
                  ~{formattedTokens} tokens
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-border pt-2">
                <span className="text-muted-foreground">Compression:</span>
                <span className="font-mono font-medium text-green-500">
                  {compressionPercent}% smaller
                </span>
              </div>
              {isLarge && (
                <div className="flex items-start gap-2 text-xs text-yellow-500 bg-yellow-500/10 p-2 rounded">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Large output may consume significant context window</span>
                </div>
              )}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Supports JavaScript, TypeScript, and Python files.</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
