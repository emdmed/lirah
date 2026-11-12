import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PickerRow } from "@/components/ui/picker";

export const CLI_OPTIONS = [
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'opencode', name: 'opencode', command: 'opencode' }
];

export function CliSelectionModal({ open, onOpenChange, selectedCli, onCliChange, cliAvailability }) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) setCursor(Math.max(0, CLI_OPTIONS.findIndex((o) => o.id === selectedCli)));
  }, [open, selectedCli]);

  const isAvailable = (option) => cliAvailability[option.id] ?? true;

  const handleCliSelect = (cliId) => {
    onCliChange(cliId);
    onOpenChange(false);
  };

  const handleKeyDown = (e) => {
    const n = CLI_OPTIONS.length;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isAvailable(CLI_OPTIONS[cursor])) handleCliSelect(CLI_OPTIONS[cursor].id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        status={`${CLI_OPTIONS.length} tools`}
        hints={[{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: 'use' }]}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>CLI tool</DialogTitle>
          <DialogDescription className="text-xs">Choose the CLI this tab launches.</DialogDescription>
        </DialogHeader>

        <div className="-mx-2 flex flex-col" role="listbox" aria-label="CLI tools">
          {CLI_OPTIONS.map((option, index) => {
            const available = isAvailable(option);
            const isSelected = option.id === selectedCli;

            return (
              <PickerRow
                key={option.id}
                selected={index === cursor}
                disabled={!available}
                glyph=""
                name={option.name}
                path={option.command}
                tag={!available ? 'not installed' : isSelected ? 'in use' : null}
                tabIndex={-1}
                onClick={() => handleCliSelect(option.id)}
                onMouseEnter={() => setCursor(index)}
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
