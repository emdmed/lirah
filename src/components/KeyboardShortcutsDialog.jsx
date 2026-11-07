import { Dialog, DialogContent, DialogDescription, DialogGroup, DialogTitle } from '@/components/ui/dialog'
import { Keycap } from './instrument/Keycap'
import { shortcutsByCategory } from '../lib/shortcuts'
import { Fig15Keys } from './Fig15Keys'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ACTIVITY } from '@/features/tabs/tabActivity'
import { ContextMoon } from './instrument/ContextMoon'

// What each glyph in the workspace pane's tab rows means, drawn with the row's own icons.
const GLYPHS = [
  ['working', 'working'],
  ['running', 'running a command'],
  ['remote', 'another agent in this repo'],
  ['done', 'your turn'],
  ['permission', 'needs you'],
  ['failed', 'auto-pilot failed'],
  ['waiting', 'at its prompt'],
  ['idle', 'idle'],
]

function GlyphLegend() {
  const row = (glyph, label) => (
    <li key={label} className='flex items-center gap-2.5 py-1 text-xs'>
      <span className='inline-flex h-4 w-4 shrink-0 items-center justify-center'>{glyph}</span>
      <span className='text-foreground'>{label}</span>
    </li>
  )
  return (
    <ul aria-label='Tab row glyphs' className='grid grid-cols-2 gap-x-4 pt-2'>
      {GLYPHS.map(([kind, label]) => {
        const { icon: Icon, color, pulse } = ACTIVITY[kind]
        return row(
          <span aria-hidden='true' className={cn('inline-flex', color, pulse && 'ins-pulse')}><Icon className='h-3.5 w-3.5' strokeWidth={2} /></span>,
          label,
        )
      })}
      {row(<ContextMoon ratio={0.6} />, 'context window fill')}
      {row(<span aria-hidden='true' className='font-mono tabular-nums text-[var(--ins-warn)]'>1</span>, 'place in the Alt+A queue')}
    </ul>
  )
}

// Built once: the list is static, see src/lib/shortcuts.js.
const SECTIONS = shortcutsByCategory()
const COUNT = SECTIONS.reduce((n, s) => n + s.items.length, 0)

function KeyCombo({ keys, note, doubleTap = false, highlight = false, either = false }) {
  return (
    <div className='flex shrink-0 items-center gap-1'>
      {keys.map((key, index) => (
        <span key={index} className='flex items-center gap-1'>
          {index > 0 && <span className='text-faint text-xs'>{doubleTap ? '⇢' : either ? '/' : '+'}</span>}
          <Keycap lit={highlight || doubleTap}>{key}</Keycap>
        </span>
      ))}
      {doubleTap && <span className='ml-1 text-xs text-[var(--ins-lamp)]'>×2</span>}
      {note && !doubleTap && <span className='ml-2 text-xs text-muted-foreground'>{note}</span>}
    </div>
  )
}

// Every shortcut, one line each: what it does, a dotted leader, the keys.
// `section` scrolls that category into view on open (the workspace pane's `?`).
export function KeyboardShortcutsDialog({ open, onOpenChange, section }) {
  const sectionRef = useRef(null)
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [section])
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
            <section key={category} ref={category === section ? sectionRef : undefined} className='flex flex-col gap-1'>
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
                      either={shortcut.either}
                    />
                  </li>
                ))}
              </ul>
              {category === 'Workspace pane' && <GlyphLegend />}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
