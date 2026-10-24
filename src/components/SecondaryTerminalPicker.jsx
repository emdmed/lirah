import { useState, useEffect, useRef } from "react";
import { FloatPane } from "./ui/float-pane";
import { PickerRow } from "./ui/picker";
import { Keycap } from "./instrument/Keycap";
import { joinKeys } from "./instrument/FrameHints";
import { shortcutKeys } from "../lib/shortcuts";

const options = [
  { id: 'nvim', label: 'nvim', glyph: '›', note: 'editor', command: 'nvim' },
  { id: 'lazygit', label: 'lazygit', glyph: '±', note: 'git', command: 'lazygit' },
];

// What terminal 2 opens with. Lives inside the pane, so it takes keys only
// while it holds focus (it focuses itself on mount) instead of listening on
// the whole window.
export function SecondaryTerminalPicker({ onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paneRef = useRef(null);

  useEffect(() => {
    paneRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
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
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
      <FloatPane
        ref={paneRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        title="terminal 2"
        hints={[{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: 'open' }]}
        className="w-full max-w-[340px] px-3 pb-4 outline-none"
        role="listbox"
        aria-label="Open in terminal 2"
      >
        <div className="flex flex-col pt-2 -mx-1">
          {options.map((opt, index) => {
            const keys = shortcutKeys(opt.id);
            return (
              <PickerRow
                key={opt.id}
                selected={index === selectedIndex}
                glyph={opt.glyph}
                name={opt.label}
                path={opt.note}
                tag={keys && <Keycap size="sm">{joinKeys(keys)}</Keycap>}
                tabIndex={-1}
                onClick={() => onSelect(opt.command)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            );
          })}
        </div>
      </FloatPane>
    </div>
  );
}
