import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Send, RotateCcw } from "lucide-react";
import { AtMentionModal } from "../../features/at-mention";
import { useAutoGrow } from "../../hooks/useAutoGrow";
import { useBlockCaret } from "../../hooks/useBlockCaret";
import { KeyChord } from "../instrument/Keycap";

export function TextareaArea({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  disabled,
  elementsIndicator,
  compactedIndicator,
  onClearContext,
  sessionId,
  handleSend,
  isSendDisabled,
  sendBlockedReason,
  budgetExhausted = false,
  atMentionActive,
  atMentionResults,
  atMentionSelectedIndex,
  onAtMentionSelect,
  currentPath,
  atMentionQuery,
  selectedFiles,
  fileStates,
}) {
  const hasIndicators = !!elementsIndicator || !!compactedIndicator;
  const sortedAtMentionResults = atMentionResults || [];
  // One line until there is more to show, at any pane width.
  useAutoGrow(textareaRef, value, { maxLines: 8 });
  const { caret } = useBlockCaret(textareaRef, value);

  return (
    <div className="relative flex flex-col gap-1">
      {/* The input sits in a recessed well with its actions on the right
          edge; the caret is positioned relative to the inner box, which
          aligns with the textarea. */}
      <div className="ins-well flex flex-1 min-h-0 items-end gap-2 pl-[10px] pr-1.5 py-1.5">
        <div className="relative flex flex-1 min-h-0 self-stretch py-0.5">
          <span className="absolute left-0 top-[5px] text-[var(--ins-lamp)] select-none pointer-events-none" aria-hidden="true">❯</span>
          {caret && (
            <span
              className="tui-caret"
              aria-hidden="true"
              style={{ left: caret.left, top: caret.top, width: caret.width, height: caret.height }}
            />
          )}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={disabled ? "waiting for terminal session…" : "type a prompt, @ to mention files"}
            aria-label="Multi-line command input"
            aria-describedby="textarea-instructions"
            rows={1}
            className="w-full flex-1 resize-none shadow-none! pl-5 pr-0 py-1 min-h-0 max-h-none caret-transparent focus-visible:outline-none"
            style={{ backgroundColor: 'transparent' }}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {budgetExhausted && (
            <span className="flex items-baseline gap-1 text-[11px] font-mono mr-1">
              <span className="tube-overflow">OVER</span>
              <span className="engraved-label">budget</span>
            </span>
          )}
          <span id="textarea-instructions" className="sr-only">
            Press Ctrl+Enter to send.
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                onClick={onClearContext}
                disabled={!sessionId}
                aria-label="Clear CLI context"
                className="gap-1 px-1.5 before:content-none after:content-none text-muted-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear CLI Context (Ctrl+Shift+L)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button swallows pointer events, so the reason would
                  never surface. The wrapper keeps the tooltip reachable. */}
              <span className="inline-flex">
                <Button
                  size="xs"
                  onClick={handleSend}
                  disabled={isSendDisabled}
                  className={`gap-1 px-1.5 disabled:opacity-100 disabled:bg-transparent disabled:text-muted-foreground ${isSendDisabled ? 'pointer-events-none' : ''}`}
                  aria-label={sendBlockedReason ? `Send to CLI — unavailable: ${sendBlockedReason}` : 'Send to CLI'}
                >
                  <Send className="h-3 w-3" />
                  send
                  <KeyChord keys={['^', '↵']} size="sm" className="ml-1" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {sendBlockedReason || 'Send to CLI (Ctrl+Enter)'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {hasIndicators && (
        <div className="flex flex-col gap-1.5">
          {elementsIndicator}
          {compactedIndicator}
        </div>
      )}
      {atMentionActive && sortedAtMentionResults.length > 0 && (
        <AtMentionModal
          results={atMentionResults}
          selectedIndex={atMentionSelectedIndex}
          onSelect={onAtMentionSelect}
          currentPath={currentPath}
          query={atMentionQuery}
          selectedFiles={selectedFiles}
          fileStates={fileStates}
        />
      )}
    </div>
  );
}
