import { Dialog, DialogContent, DialogDescription, DialogGroup, DialogTitle } from '@/components/ui/dialog'
import { Keycap } from './instrument/Keycap'
import { shortcutsByCategory } from '../lib/shortcuts'
import { Fig15Keys } from './Fig15Keys'

// Built once: the list is static, see src/lib/shortcuts.js.
const SECTIONS = shortcutsByCategory()
const COUNT = SECTIONS.reduce((n, s) => n + s.items.length, 0)

function KeyCombo({ keys, note, doubleTap = false, highlight = false }) {
  return (
    <div className='flex shrink-0 items-center gap-1'>
      {keys.map((key, index) => (
        <span key={index} className='flex items-center gap-1'>
          {index > 0 && <span className='text-faint text-xs'>{doubleTap ? '⇢' : '+'}</span>}
          <Keycap lit={highlight || doubleTap}>{key}</Keycap>
        </span>
      ))}
      {doubleTap && <span className='ml-1 text-xs text-[var(--ins-lamp)]'>×2</span>}
      {note && !doubleTap && <span className='ml-2 text-xs text-muted-foreground'>{note}</span>}
    </div>
  )
}

// Every shortcut, one line each: what it does, a dotted leader, the keys.
export function KeyboardShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size='lg'
        className='max-h-[80vh] flex flex-col overflow-hidden'
        keys={['^', 'H']}
        status={`${COUNT} shortcuts`}
        hints={[{ keys: [':'], label: 'run any action by name' }]}
      >
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription className='sr-only'>Quick reference for all available shortcuts.</DialogDescription>

        <div className='flex min-h-0 flex-col gap-5 overflow-y-auto pr-2'>
          <Fig15Keys />
          {SECTIONS.map(({ category, items }) => (
            <section key={category} className='flex flex-col gap-1'>
              <DialogGroup label={category} />
              <ul className='flex flex-col'>
                {items.map((shortcut) => (
                  <li key={shortcut.id} className='flex items-center gap-2.5 py-1 text-xs'>
                    <span className='shrink-0 truncate text-foreground'>{shortcut.description}</span>
                    <span aria-hidden='true' className='min-w-3 flex-1 translate-y-[3px] border-b border-dotted border-[var(--ins-edge-strong)]' />
                    <KeyCombo
                      keys={shortcut.keys}
                      note={shortcut.note}
                      doubleTap={shortcut.doubleTap}
                      highlight={shortcut.highlight}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
