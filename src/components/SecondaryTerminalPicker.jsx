import { Terminal, GitBranch, Code } from "lucide-react";

const options = [
  { id: 'nvim', label: 'nvim', icon: <Code className="size-4" />, command: 'nvim' },
  { id: 'lazygit', label: 'lazygit', icon: <GitBranch className="size-4" />, command: 'lazygit' },
  { id: 'shell', label: 'shell', icon: <Terminal className="size-4" />, command: null },
];

export function SecondaryTerminalPicker({ onSelect }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
      <div
        className="flex flex-col gap-1 border border-sketch p-4 shadow-xs font-mono rounded-none"
        style={{ backgroundColor: 'var(--color-input-background)' }}
      >
        <div className="text-sm font-semibold text-foreground mb-2">Secondary terminal</div>
        {options.map((opt) => (
          <button
            key={opt.id}
            className="flex items-center gap-3 px-3 py-2 text-sm text-foreground transition-[color,box-shadow] outline-none rounded-none hover:bg-primary/10 focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-ring/70 focus-visible:outline-offset-0"
            onClick={() => onSelect(opt.command)}
          >
            <span className="text-muted-foreground">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
