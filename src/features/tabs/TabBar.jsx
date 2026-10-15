import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Keycap } from "@/components/instrument/Keycap";

const STATUS_SLOT_ID = "tabbar-status-slot";

// Renders the active tab's status controls into the tab bar's right side.
// Children are always evaluated by the caller (they may contain hooks), but
// only the active tab mounts them.
export function TabBarStatusSlot({ active, children }) {
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    setSlot(document.getElementById(STATUS_SLOT_ID));
  }, []);
  if (!active || !slot) return null;
  return createPortal(children, slot);
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onAdd, onReorder }) {
  const handleMiddleClick = useCallback((e, tabId) => {
    if (e.button === 1) {
      e.preventDefault();
      if (tabs.length > 1) onClose(tabId);
    }
  }, [tabs.length, onClose]);

  return (
    <div className="chassis-rail flex items-stretch h-8 edge-b-engraved select-none shrink-0">
      {/* Tabs share up to ~5 slots, compress to a floor, then scroll */}
      <div className="flex items-stretch min-w-0 max-w-[720px] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => onSwitch(tab.id)}
              onMouseDown={(e) => handleMiddleClick(e, tab.id)}
              title={tab.projectPath}
              className={cn(
                "group relative flex items-center gap-2 pl-2.5 pr-1.5 text-xs min-w-[112px] max-w-[200px] shrink",
                "shadow-[inset_-1px_0_0_0_var(--tui-line)]",
                isActive
                  ? "text-foreground bg-[var(--ins-gutter)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Keycap size="sm" lit={isActive}>{idx + 1}</Keycap>
              <span className="truncate flex-1 text-left">{tab.label}</span>
              {isActive && <span className="absolute left-0 right-px top-0 h-[2px] bg-[var(--ins-lamp)]" aria-hidden="true" />}
              {tabs.length > 1 && (
                <span
                  role="button"
                  aria-label={`Close ${tab.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  className={cn(
                    "inline-flex items-center justify-center w-4 h-4 text-[11px] shrink-0 text-muted-foreground hover:text-[var(--ins-fault)]",
                    isActive ? "opacity-60 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={onAdd}
        className="flex items-center justify-center w-8 shrink-0 text-sm text-muted-foreground hover:text-[var(--ins-lamp)] shadow-[inset_-1px_0_0_0_var(--tui-line)]"
        title="New tab (Ctrl+T)"
        aria-label="New tab"
      >
        +
      </button>
      <div id={STATUS_SLOT_ID} className="flex-1 min-w-0" />
    </div>
  );
}
