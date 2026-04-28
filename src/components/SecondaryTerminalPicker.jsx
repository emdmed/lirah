import { useState, useEffect, useCallback } from "react";
import { GitBranch, Code } from "lucide-react";

const options = [
  { id: 'nvim', label: 'nvim', icon: <Code className="size-4" />, command: 'nvim' },
  { id: 'lazygit', label: 'lazygit', icon: <GitBranch className="size-4" />, command: 'lazygit' },
];

export function SecondaryTerminalPicker({ onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        onSelect(options[selectedIndex].command);
        break;
    }
  }, [selectedIndex, onSelect]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
      <div
        className="flex flex-col gap-1 border border-sketch p-4 shadow-xs font-mono rounded-none"
        style={{ backgroundColor: 'var(--color-input-background)' }}
      >
        <div className="text-sm font-semibold text-foreground mb-2">Secondary terminal</div>
        {options.map((opt, index) => (
          <button
            key={opt.id}
            className={`flex items-center gap-3 px-3 py-2 text-sm text-foreground transition-colors outline-none rounded-sm hover:bg-foreground/5 ${
              index === selectedIndex ? 'bg-foreground/8 border-l-2 border-primary' : 'border-l-2 border-transparent'
            }`}
            onClick={() => onSelect(opt.command)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="text-muted-foreground">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 pt-2 border-t border-t-sketch">
          <span><span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm text-[10px]">↑↓</span> Navigate</span>
          <span><span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm text-[10px]">Enter</span> Select</span>
        </div>
      </div>
    </div>
  );
}
