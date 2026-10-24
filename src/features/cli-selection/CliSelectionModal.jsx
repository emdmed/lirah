import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PickerRow } from "@/components/ui/picker";

export function CliSelectionModal({ open, onOpenChange, selectedCli, onCliChange, cliAvailability }) {
  const cliOptions = [
    { id: 'claude-code', name: 'Claude Code', command: 'claude' },
    { id: 'opencode', name: 'opencode', command: 'opencode' }
  ];

  const handleCliSelect = (cliId) => {
    onCliChange(cliId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogTitle>CLI tool</DialogTitle>
        <DialogDescription className="sr-only">Choose the CLI this tab launches.</DialogDescription>

        <div className="-mx-2 flex flex-col" role="listbox" aria-label="CLI tools">
          {cliOptions.map((option) => {
            const isAvailable = cliAvailability[option.id] ?? true;
            const isSelected = option.id === selectedCli;

            return (
              <PickerRow
                key={option.id}
                selected={isSelected}
                disabled={!isAvailable}
                glyph=""
                name={option.name}
                path={option.command}
                tag={!isAvailable ? 'not installed' : isSelected ? 'in use' : null}
                onClick={() => handleCliSelect(option.id)}
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
