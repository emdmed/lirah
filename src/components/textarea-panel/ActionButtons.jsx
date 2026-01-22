import React from "react";
import { Button } from "../ui/button";
import { Send } from "lucide-react";

/**
 * Action buttons at the bottom of the textarea panel
 * @param {Function} onSend - Callback to send content
 * @param {boolean} disabled - Whether send button is disabled
 */
export function ActionButtons({ onSend, disabled }) {
  return (
    <div className="flex justify-end gap-2">
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
