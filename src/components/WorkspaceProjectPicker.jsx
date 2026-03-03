import { useState, useEffect, useCallback } from "react";
import { Folder } from "lucide-react";

export function WorkspaceProjectPicker({ projects, onSelect, onCancel }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : projects.length - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < projects.length - 1 ? prev + 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        onSelect(projects[selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onCancel();
        break;
    }
  }, [selectedIndex, projects, onSelect, onCancel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex flex-col gap-1 border border-sketch p-4 shadow-xs font-mono rounded-none min-w-[300px]"
        style={{ backgroundColor: 'var(--color-input-background)' }}
      >
        <div className="text-sm font-semibold text-foreground mb-2">Select project</div>
        {projects.map((project, index) => (
          <button
            key={project.name}
            className={`flex items-center gap-3 px-3 py-2 text-sm text-foreground transition-[color,box-shadow] outline-none rounded-none hover:bg-primary/10 focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-ring/70 focus-visible:outline-offset-0 ${
              index === selectedIndex ? 'bg-primary/10' : ''
            }`}
            onClick={() => onSelect(project)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <Folder className="size-4 text-muted-foreground" />
            <div className="flex flex-col items-start">
              <span>{project.name}</span>
              <span className="text-xs text-muted-foreground">{project.real_path || project.path}</span>
            </div>
          </button>
        ))}
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
          ↑↓ to navigate, Enter to select, Esc to cancel
        </div>
      </div>
    </div>
  );
}
