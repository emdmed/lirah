import { useModifierHold } from '../hooks/useModifierHold';
import { compactKeys, hintBarEntries } from '../lib/shortcuts';
import { KeyChord } from './instrument/Keycap';

// htop-style key bar, shown only while a modifier is held on its own. Entries
// come from the shared shortcut list (src/lib/shortcuts.js).
export function KeyHintBar() {
  const { held } = useModifierHold();
  if (!held) return null;
  const entries = hintBarEntries(held);

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[105] flex items-center gap-4 h-8 px-2 overflow-hidden text-xs font-mono bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]"
      aria-hidden="true"
    >
      {entries.held.map((s) => (
        <KeyChord key={s.id} keys={compactKeys(s.keys)} label={s.hint.label} />
      ))}
      {entries.always.map((s, i) => (
        <KeyChord key={s.id} keys={compactKeys(s.keys)} label={s.hint.label} className={i === 0 ? 'ml-auto' : undefined} />
      ))}
    </div>
  );
}
