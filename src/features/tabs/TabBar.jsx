import { useCallback } from "react";
import { cn } from "@/lib/utils";

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onAdd, onReorder }) {
  const handleMiddleClick = useCallback((e, tabId) => {
    if (e.button === 1) {
      e.preventDefault();
      if (tabs.length > 1) onClose(tabId);
    }
  }, [tabs.length, onClose]);

  return (
    <div className="flex items-center h-7 bg-background border-b border-border select-none shrink-0 overflow-x-auto">
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
            className={cn(
              "group relative flex items-center gap-1 px-3 h-full text-xs font-medium border-r border-border transition-colors min-w-0 max-w-[160px]",
              isActive
                ? "bg-background text-foreground border-b-2 border-b-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <span className="truncate">{tab.label}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (tabs.length > 1) onClose(tab.id);
              }}
              className={cn(
                "inline-flex items-center justify-center w-4 h-4 rounded-sm text-[10px] shrink-0 hover:bg-destructive/20 hover:text-destructive",
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              ×
            </span>
          </button>
        );
      })}
      <button
        onClick={onAdd}
        className="flex items-center justify-center w-7 h-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-sm shrink-0"
        title="New tab (Ctrl+T)"
      >
        +
      </button>
    </div>
  );
}
