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
    <div className="chassis-rail flex items-center h-7 border-b edge-b-engraved select-none shrink-0 overflow-x-auto">
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
            className={cn(
              "group relative flex items-center gap-1 px-2 h-full text-xs min-w-0 max-w-[180px]",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="truncate">{idx + 1}:{tab.label}{isActive ? "*" : ""}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (tabs.length > 1) onClose(tab.id);
              }}
              className={cn(
                "inline-flex items-center justify-center w-4 h-4 text-[11px] shrink-0 hover:bg-destructive hover:text-destructive-foreground",
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
        className="flex items-center justify-center px-2 h-full text-muted-foreground hover:bg-foreground hover:text-background text-xs shrink-0"
        title="New tab (Ctrl+T)"
      >
        [+]
      </button>
    </div>
  );
}
