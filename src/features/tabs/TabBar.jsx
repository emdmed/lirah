import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSetting } from "../settings/settingsStore";

const STATUS_SLOT_ID = "tabbar-status-slot";

// Renders the active tab's status controls into the tab bar's right side.
// Children are always evaluated by the caller (they may contain hooks), but
// only the active tab mounts them.
export function TabBarStatusSlot({ active, children }) {
  const [slot, setSlot] = useState(null);
  // Zen unmounts the tab bar; look the slot up again so we never portal into
  // a detached node, and render nothing while it's gone.
  const [zenMode] = useSetting('zenMode');
  useEffect(() => {
    setSlot(document.getElementById(STATUS_SLOT_ID));
  }, [zenMode]);
  if (!active || !slot?.isConnected) return null;
  return createPortal(children, slot);
}

// Tabs themselves live in the sidebar's TABS pane (new tab is its [+] key);
// this rail only carries the active tab's status controls.
export function TabBar() {
  return (
    <div className="chassis-rail flex items-stretch h-8 edge-b-engraved select-none shrink-0">
      <div id={STATUS_SLOT_ID} className="flex-1 min-w-0" />
    </div>
  );
}
