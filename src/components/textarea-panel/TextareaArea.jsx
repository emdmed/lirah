import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Send, RotateCcw } from "lucide-react";
import { AtMentionModal } from "../../features/at-mention";

export function TextareaArea({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  disabled,
  isWide,
  elementsIndicator,
  compactedIndicator,
  selectedTemplateId,
  onClearContext,
  sessionId,
  handleSend,
  isSendDisabled,
  atMentionActive,
  atMentionResults,
  atMentionSelectedIndex,
  onAtMentionSelect,
  currentPath,
  atMentionQuery,
  selectedFiles,
  fileStates,
  footerInfo,
}) {
  const hasIndicators = !!elementsIndicator || !!compactedIndicator;
  const sortedAtMentionResults = atMentionResults || [];

  return (
    <div className={`relative flex flex-col gap-2 ${isWide ? 'flex-1 min-h-[200px]' : 'min-h-[120px] max-h-[340px]'}`}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={disabled ? "Waiting for terminal session..." : "Type your command here... (Ctrl+Enter to send)"}
        aria-label="Multi-line command input"
        aria-describedby="textarea-instructions"
        className="w-full flex-1 resize-none"
      />
      {hasIndicators && (
        <div className="flex flex-col gap-1.5">
          {elementsIndicator}
          {compactedIndicator}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {footerInfo}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span id="textarea-instructions" className="text-muted-foreground font-mono text-xs">
            {selectedTemplateId && !value?.trim() ? (
              <span className="text-primary">Ctrl+Enter</span>
            ) : (
              "Ctrl+Enter"
            )}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClearContext}
                disabled={!sessionId}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear CLI Context (Ctrl+Shift+L)</TooltipContent>
          </Tooltip>
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={isSendDisabled}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
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
