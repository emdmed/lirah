import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const shortcuts = [
  {
    category: "Sidebar & Views",
    items: [
      { keys: ["Ctrl", "S"], description: "Toggle Navigation Mode" },
      { keys: ["Ctrl", "K"], description: "Launch CLI / Toggle Claude Mode" },
      { keys: ["Ctrl", "P"], description: "Open Projects Palette" },
    ],
  },
  {
    category: "Input & Editing",
    items: [
      { keys: ["Ctrl", "T"], description: "Focus Textarea" },
      { keys: ["Ctrl", "Enter"], description: "Send Textarea Content" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Restore Last Prompt", note: "when empty" },
      { keys: ["Ctrl", "Shift", "P"], description: "Compact Whole Project" },
      { keys: ["Ctrl", "Ctrl"], description: "Toggle Orchestration Mode", note: "double-tap" },
      { keys: ["Alt", "Alt"], description: "Open Template Selector / Clear Template", note: "double-tap" },
    ],
  },
  {
    category: "Search & Filter",
    items: [
      { keys: ["Ctrl", "F"], description: "Focus File Search" },
      { keys: ["Ctrl", "G"], description: "Toggle Git Changes Filter" },
    ],
  },
  {
    category: "System",
    items: [
      { keys: ["Ctrl", "W"], description: "Toggle File Watchers" },
      { keys: ["Ctrl", "H"], description: "Toggle This Dialog" },
    ],
  },
];

function KeyCombo({ keys, note }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span className="text-muted-foreground text-xs">+</span>}
          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-sketch rounded">
            {key}
          </kbd>
        </span>
      ))}
      {note && (
        <span className="text-xs text-muted-foreground ml-1">({note})</span>
      )}
    </div>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.category}
              </h3>
              <div className="flex flex-col gap-1">
                {section.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <KeyCombo keys={shortcut.keys} note={shortcut.note} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t border-sketch">
          Press <kbd className="px-1 py-0.5 bg-muted border border-sketch rounded text-xs">Ctrl+H</kbd> to close
        </div>
      </DialogContent>
    </Dialog>
  );
}
