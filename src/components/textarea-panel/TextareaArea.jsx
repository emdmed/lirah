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
    <div className={`relative ${isWide ? 'flex-1 min-h-[200px]' : 'min-h-[120px] max-h-[300px]'}`}>
      {hasIndicators && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 max-w-[calc(100%-80px)]">
          {elementsIndicator}
          {compactedIndicator}
        </div>
      )}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={disabled ? "Waiting for terminal session..." : "Type your command here... (Ctrl+Enter to send)"}
        aria-label="Multi-line command input"
        aria-describedby="textarea-instructions"
        className="w-full h-full resize-none pb-10 pt-10"
      />
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
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
