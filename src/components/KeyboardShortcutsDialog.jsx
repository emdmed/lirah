import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Keyboard, Search, Command, Zap, GitBranch } from 'lucide-react'

const shortcuts = [
  {
    category: 'Sidebar & Views',
    icon: <Command className='w-4 h-4' />,
    items: [
      { keys: ['Ctrl', 'S'], description: 'Toggle Navigation Mode' },
      { keys: ['Ctrl', 'K'], description: 'Launch CLI / Toggle Claude Mode' },
      { keys: ['Ctrl', 'P'], description: 'Open Bookmarks Palette' },
    ],
  },
  {
    category: 'Input & Editing',
    icon: <Zap className='w-4 h-4' />,
    items: [
      { keys: ['Ctrl', 'T'], description: 'Focus Textarea' },
      { keys: ['Ctrl', 'Enter'], description: 'Send Textarea Content' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Restore Last Prompt', note: 'when empty' },
      { keys: ['Ctrl', 'Shift', 'P'], description: 'Compact Whole Project' },
      { keys: ['Ctrl', 'Ctrl'], description: 'Toggle Orchestration Mode', note: 'double-tap' },
      { keys: ['Alt', 'Alt'], description: 'Open Template Selector / Clear Template', note: 'double-tap' },
    ],
  },
  {
    category: 'Search & Filter',
    icon: <Search className='w-4 h-4' />,
    items: [
      { keys: ['@'], description: 'Quick File Search', note: 'in textarea, type @' },
      { keys: ['Ctrl', 'F'], description: 'Focus File Search' },
      { keys: ['Ctrl', 'G'], description: 'Toggle Git Changes Filter' },
    ],
  },
  {
    category: 'Token Usage',
    icon: <Zap className='w-4 h-4' />,
    items: [
      { keys: ['Ctrl', 'Shift', 'D'], description: 'Open Token Dashboard' },
      { keys: ['Ctrl', 'Shift', 'B'], description: 'Open Budget Settings' },
    ],
  },
  {
    category: 'Git & Branch',
    icon: <GitBranch className='w-4 h-4' />,
    items: [
      { keys: ['Ctrl', 'Shift', 'T'], description: 'Toggle Branch Tasks' },
    ],
  },
  {
    category: 'System',
    icon: <Keyboard className='w-4 h-4' />,
    items: [
      { keys: ['Ctrl', 'W'], description: 'Toggle File Watchers' },
      { keys: ['Ctrl', '`'], description: 'Toggle Secondary Terminal' },
      { keys: ['Ctrl', 'H'], description: 'Toggle This Dialog' },
    ],
  },
]

function KeyCombo({ keys, note, highlight = false }) {
  const isDoubleTap = note === 'double-tap'
  return (
    <div className='flex items-center gap-1'>
      {keys.map((key, index) => (
        <span key={index} className='flex items-center gap-1'>
          {index > 0 && !isDoubleTap && <span className='text-muted-foreground text-xs'>+</span>}
          {isDoubleTap && index > 0 && <span className='text-muted-foreground text-xs mx-0.5'>⇢</span>}
          <kbd className={`px-2 py-1 text-xs font-mono border border-sketch rounded-none transition-all ${
            highlight || isDoubleTap
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'bg-muted/50 border-muted/30 hover:bg-muted'
          }`}>
            {key}
          </kbd>
        </span>
      ))}
      {note && !isDoubleTap && (
        <span className='text-xs text-muted-foreground ml-2 italic'>{note}</span>
      )}
      {isDoubleTap && (
        <span className='text-xs text-primary ml-1 font-medium'>×2</span>
      )}
    </div>
  )
}

export function KeyboardShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[80vh] border border-sketch rounded-none'>
        <DialogHeader className='pb-4 border-b border-sketch'>
          <DialogTitle className='flex items-center gap-3 text-lg'>
            <div className='p-2 bg-primary/10'>
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
          {shortcuts.map((section) => (
            <div key={section.category} className='space-y-2'>
              <div className='flex items-center gap-2 pb-2 border-b border-sketch'>
                <div className='p-1.5 bg-muted/30 text-muted-foreground'>
                  {section.icon}
                </div>
                <h3 className='text-sm font-semibold text-foreground'>
                  {section.category}
                </h3>
              </div>
              <div className='space-y-1 pl-6'>
                {section.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className='group flex items-center justify-between py-1.5 px-2 bg-muted/20 hover:bg-muted/40 transition-colors'
                  >
                    <div className='flex items-center gap-3 flex-1 min-w-0'>
                      <div className='w-2 h-2 bg-primary/20 group-hover:bg-primary/40 transition-colors flex-shrink-0' />
                      <span className='text-sm text-foreground truncate'>
                        {shortcut.description}
                      </span>
                    </div>
                    <KeyCombo
                      keys={shortcut.keys}
                      note={shortcut.note}
                      highlight={shortcut.keys[0] === '@'}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className='flex items-center justify-between pt-4 border-t border-sketch text-xs text-muted-foreground'>
          <div className='flex items-center gap-2'>
            <div className='w-2 h-2 bg-green-500/60 animate-pulse' />
            <span>Press <kbd className='px-1.5 py-0.5 bg-muted border border-sketch rounded-none text-xs font-mono'>Ctrl+H</kbd> to close</span>
          </div>
          <div className='flex items-center gap-1'>
            <Search className='w-3 h-3' />
            <span>Try @ in textarea</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
