import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerDownLeft, MessageSquare, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ASK_ACTIONS } from './designAsk';
import { getDesignColors, kindColor } from './DesignNode';

/**
 * The bridge from diagram back to conversation: pick parts, ask about them.
 *
 * A drawer over the bottom of the canvas rather than a strip in the layout —
 * asking a question is a moment, not a permanent part of the view, and the
 * diagram must not resize under the reader the instant they click a box.
 * Collapsed it is a single pill; the diagram stays a diagram until you have a
 * question about it.
 */
export function DesignAskBar({
  selected,
  onDeselect,
  onClear,
  onAsk,
  attachFileCount,
  open,
  onOpenChange,
}) {
  const colors = getDesignColors();
  const [question, setQuestion] = useState('');
  const [attach, setAttach] = useState(true);
  const inputRef = useRef(null);

  const selectionKey = selected.map((n) => n.id).join('|');

  // A fresh selection is a fresh question — carrying the old text over reads as
  // a bug the first time it happens.
  useEffect(() => setQuestion(''), [selectionKey]);

  // Opening the drawer is an act of intent: put the caret where the typing goes.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!selected.length) return null;

  const submit = (text) => {
    const q = (text ?? question).trim();
    if (!q) {
      onOpenChange(true);
      inputRef.current?.focus();
      return;
    }
    onAsk(q, { attachFiles: attach });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="Ask about the selection"
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 font-mono text-[11px] px-3 py-1.5 border edge-engraved bg-background/95 shadow-lg backdrop-blur-sm hover:border-foreground/40"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Ask about {selected.length} selected
        {selected.length === 1 && (
          <span className="opacity-70" style={{ color: kindColor(selected[0].kind, colors) }}>
            {selected[0].label}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-1.5 border-t edge-engraved bg-background/95 backdrop-blur-sm shadow-[0_-8px_24px_rgba(0,0,0,0.35)] px-3 py-2"
      onKeyDown={(e) => {
        // The dialog closes on Escape; in here Escape belongs to the drawer.
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (question) setQuestion('');
          else onOpenChange(false);
        }
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Ask about
        </span>
        {selected.map((node) => (
          <span
            key={node.id}
            className="flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border border-border"
            style={{ color: kindColor(node.kind, colors) }}
          >
            {node.label}
            <button type="button" onClick={() => onDeselect(node.id)} title="Remove from selection">
              <X className="w-2.5 h-2.5 opacity-60 hover:opacity-100" />
            </button>
          </span>
        ))}
        {selected.length > 1 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[10px] text-muted-foreground hover:underline"
          >
            clear
          </button>
        )}
        <span className="font-mono text-[10px] text-muted-foreground/70 ml-auto hidden lg:inline">
          ctrl/⌘-click a box to select several
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          title="Hide the ask drawer (Esc)"
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {ASK_ACTIONS.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            title={action.hint}
            onClick={() => submit(action.question)}
          >
            {action.label}
          </Button>
        ))}

        <Input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              submit();
            }
          }}
          placeholder="…or ask your own question about the selection"
          className="flex-1 min-w-[220px] h-7 font-mono text-xs rounded-none"
        />

        {attachFileCount > 0 && (
          <button
            type="button"
            onClick={() => setAttach((v) => !v)}
            title={
              attach
                ? 'These files go into the prompt context'
                : 'Ask about the selection without attaching its files'
            }
            className={`flex items-center gap-1 font-mono text-[10px] px-1.5 py-1 border ${
              attach ? 'border-border' : 'border-border/40 text-muted-foreground/60'
            }`}
          >
            <Paperclip className="w-3 h-3" />
            {attachFileCount} file{attachFileCount > 1 ? 's' : ''}
          </button>
        )}

        <Button size="sm" onClick={() => submit()} title="Put this in the prompt box (Enter)">
          <CornerDownLeft className="w-3.5 h-3.5 mr-1.5" /> To prompt
        </Button>
      </div>
    </div>
  );
}
