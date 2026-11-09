import { WindowControls } from '../../components/WindowControls';
import { KeyChord } from '../../components/instrument/Keycap';
import { useSetting } from '../settings/settingsStore';
import { IS_MAC } from '../../utils/pathUtils';
import { shortcutKeys } from '../../lib/shortcuts';

// The active tab portals its LirahMark (lit while its session runs) in here.
export const ZEN_LINE_MARK_SLOT_ID = 'zen-line-mark-slot';

// Zen's bottom line: stands in for the header, so it drags the window and
// carries the window controls (on hover, at the right; at the left on macOS).
// Drag and controls follow the title-bar setting, as the header does.
export function ZenLine() {
  const [showTitleBar] = useSetting('showTitleBar');
  const drag = showTitleBar ? { 'data-tauri-drag-region': true } : {};
  const controls = showTitleBar && (
    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <WindowControls />
    </div>
  );

  return (
    <div
      className="group flex items-center gap-3 h-8 px-2 shrink-0 select-none text-xs font-mono bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]"
      {...drag}
    >
      {IS_MAC && controls}
      <div id={ZEN_LINE_MARK_SLOT_ID} className="flex items-center shrink-0" />
      <div className="flex-1 self-stretch" {...drag} />
      <KeyChord keys={shortcutKeys('zen-toggle')} label="zen" />
      {!IS_MAC && controls}
    </div>
  );
}
