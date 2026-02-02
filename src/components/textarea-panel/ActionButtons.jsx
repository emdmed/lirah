import React from "react";
import { Button } from "../ui/button";
import { Send, Coins } from "lucide-react";

const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

/**
 * Action buttons at the bottom of the textarea panel
 * @param {Function} onSend - Callback to send content
 * @param {boolean} disabled - Whether send button is disabled
 * @param {Object} tokenUsage - Token usage data from Claude session
 */
export function ActionButtons({ onSend, disabled, tokenUsage }) {
  const hasTokens = tokenUsage && (tokenUsage.input_tokens > 0 || tokenUsage.output_tokens > 0);
  const totalTokens = hasTokens
    ? tokenUsage.input_tokens + tokenUsage.cache_read_input_tokens + tokenUsage.cache_creation_input_tokens + tokenUsage.output_tokens
    : 0;

  return (
    <div className="flex items-center gap-3">
      {hasTokens && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <Coins className="w-3 h-3" />
          <span>{formatTokenCount(totalTokens)} tokens</span>
        </div>
      )}
      <Button
        size="sm"
        onClick={onSend}
        disabled={disabled}
      >
        <Send className="h-4 w-4 mr-2" />
        Send to Terminal
      </Button>
    </div>
  );
}
