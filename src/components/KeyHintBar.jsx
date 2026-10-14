import { useModifierHold } from '../hooks/useModifierHold';
import { KeyChord } from './instrument/Keycap';

// htop-style key bar, shown only while a modifier is held on its own.
const HINTS = {
  ctrl: [
    [['^', 'T'], 'new tab'], [['^', 'W'], 'close tab'], [['^', '1-9'], 'go to tab'], [['^', 'K'], 'cli'],
    [['^', 'G'], 'git'], [['^', 'M'], 'md'], [['^', 'H'], 'help'], [['^', '↵'], 'send'], [['^', ':'], 'commands'],
  ],
  'ctrl+shift': [
    [['^', '⇧', 'P'], 'compact'], [['^', '⇧', 'D'], 'tokens'], [['^', '⇧', 'L'], 'clear ctx'], [['^', '⇧', 'E'], 'preview'],
    [['^', '⇧', 'I'], 'instances'], [['^', '⇧', 'space'], 'commit'],
  ],
};

export function KeyHintBar() {
  const { held } = useModifierHold();
  if (!held) return null;

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[105] flex items-center gap-4 h-8 px-2 overflow-hidden text-xs font-mono bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]"
      aria-hidden="true"
    >
      {HINTS[held].map(([keys, label]) => (
        <KeyChord key={keys.join('')} keys={keys} label={label} />
      ))}
      <KeyChord keys={['alt', '1-4']} label="panes" className="ml-auto" />
    </div>
  );
}
