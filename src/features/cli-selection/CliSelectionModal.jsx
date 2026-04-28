import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check } from "lucide-react";

export function CliSelectionModal({ open, onOpenChange, selectedCli, onCliChange, cliAvailability }) {
  const cliOptions = [
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'opencode', name: 'opencode' }
  ];

  const handleCliSelect = (cliId) => {
    onCliChange(cliId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>CLI Tool</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          {cliOptions.map((option) => {
            const isAvailable = cliAvailability[option.id] ?? true;
            const isSelected = option.id === selectedCli;

            return (
              <button
                key={option.id}
                disabled={!isAvailable}
                onClick={() => handleCliSelect(option.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-none text-sm text-left transition-colors ${
                  isSelected ? 'bg-foreground/8 border-l-2 border-primary' : 'border-l-2 border-transparent hover:bg-foreground/5'
                } ${!isAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span>{option.name}</span>
                {isSelected && <Check className="w-4 h-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
