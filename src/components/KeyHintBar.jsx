import { useModifierHold } from '../hooks/useModifierHold';

// htop-style key bar, shown only while a modifier is held on its own.
const HINTS = {
  ctrl: [
    ['^T', 'new tab'], ['^W', 'close tab'], ['^1-9', 'go to tab'], ['^K', 'cli'],
    ['^G', 'git'], ['^M', 'md'], ['^H', 'help'], ['^↵', 'send'], ['^:', 'commands'],
  ],
  'ctrl+shift': [
    ['^⇧P', 'compact'], ['^⇧D', 'tokens'], ['^⇧L', 'clear ctx'], ['^⇧E', 'preview'],
    ['^⇧I', 'instances'], ['^⇧space', 'commit'],
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
      {HINTS[held].map(([key, label]) => (
        <span key={key} className="whitespace-nowrap">
          <span className="tui-key">{key}</span> <span className="text-muted-foreground">{label}</span>
        </span>
      ))}
      <span className="ml-auto whitespace-nowrap text-muted-foreground">
        <span className="tui-key">alt+1-4</span> panes
      </span>
    </div>
  );
}
