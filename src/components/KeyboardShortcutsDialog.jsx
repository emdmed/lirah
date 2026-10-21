import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Keyboard, Search, Command, Zap, GitBranch, Layers, Bot, Gauge } from 'lucide-react'
import { Keycap } from './instrument/Keycap'
import { shortcutsByCategory } from '../lib/shortcuts'

const CATEGORY_ICONS = {
  'Tabs': Layers,
  'Panes & Views': Command,
  'Prompt': Zap,
  'Agent & CLI': Bot,
  'Files & Search': Search,
  'Git': GitBranch,
  'Token Usage': Gauge,
}

// Built once: the list is static, see src/lib/shortcuts.js.
const SECTIONS = shortcutsByCategory()

function KeyCombo({ keys, note, doubleTap = false, highlight = false }) {
  return (
    <div className='flex items-center gap-1'>
      {keys.map((key, index) => (
        <span key={index} className='flex items-center gap-1'>
          {index > 0 && <span className='text-muted-foreground text-xs'>{doubleTap ? '⇢' : '+'}</span>}
          <Keycap lit={highlight || doubleTap}>{key}</Keycap>
        </span>
      ))}
      {doubleTap && <span className='text-xs text-[var(--ins-lamp)] ml-1 font-medium'>×2</span>}
      {note && !doubleTap && <span className='text-xs text-muted-foreground ml-2 italic'>{note}</span>}
    </div>
  )
}

export function KeyboardShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[80vh]'>
        <DialogHeader className='pb-4 border-b edge-b-engraved'>
          <DialogTitle className='flex items-center gap-3 text-lg'>
            <div className='p-2 bg-[var(--ins-raised)] shadow-[inset_0_0_0_1px_var(--ins-edge-strong)]'>
              <Keyboard className='w-5 h-5 text-primary' />
            </div>
            <div>
              <div>Keyboard Shortcuts</div>
              <div className='text-xs font-normal text-muted-foreground mt-1'>
                Quick reference for all available shortcuts
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className='flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2'>
          {SECTIONS.map(({ category, items }) => {
            const Icon = CATEGORY_ICONS[category] || Keyboard
            return (
              <div key={category} className='space-y-2'>
                <div className='flex items-center gap-2 pb-2 border-b edge-b-engraved'>
                  <div className='p-1.5 bg-muted/30 text-muted-foreground'>
                    <Icon className='w-4 h-4' />
                  </div>
                  <h3 className='text-sm font-semibold text-foreground'>{category}</h3>
                </div>
                <div className='space-y-1 pl-6'>
                  {items.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className='group flex items-center justify-between py-1.5 px-2 bg-muted/20 hover:bg-muted/40 transition-colors'
                    >
                      <div className='flex items-center gap-3 flex-1 min-w-0'>
                        <div className='w-2 h-2 bg-[var(--ins-edge-strong)] group-hover:bg-[var(--ins-lamp)] transition-colors flex-shrink-0' />
                        <span className='text-sm text-foreground truncate'>{shortcut.description}</span>
                      </div>
                      <KeyCombo
                        keys={shortcut.keys}
                        note={shortcut.note}
                        doubleTap={shortcut.doubleTap}
                        highlight={shortcut.highlight}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className='flex items-center justify-between pt-4 border-t edge-t-engraved text-xs text-muted-foreground'>
          <div className='flex items-center gap-1.5'>
            <span>Press</span><Keycap size='sm'>Ctrl</Keycap><Keycap size='sm'>H</Keycap><span>to close</span>
          </div>
          <div className='flex items-center gap-1.5'>
            <Keycap size='sm'>:</Keycap><span>runs any action by name</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
