import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Pencil, Ban, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * File state selector using shadcn ToggleGroup
 * Provides a segmented control for selecting file states in textarea panel
 *
 * @param {Object} props
 * @param {'modify'|'do-not-modify'|'use-as-example'} props.value - Current active state
 * @param {Function} props.onValueChange - Callback when state changes: (newState) => void
 * @param {boolean} props.showKeyboardHints - Whether to show keyboard shortcut hints
 */
export function FileStateSelector({ value, onValueChange, className, showKeyboardHints = false }) {
  const states = [
    {
      value: "modify",
      icon: Pencil,
      ariaLabel: "Set as modifiable (key 1)",
      title: "File will be modified (1)",
      keyHint: "1"
    },
    {
      value: "do-not-modify",
      icon: Ban,
      ariaLabel: "Set as excluded (key 2)",
      title: "File is reference only, do not modify (2)",
      keyHint: "2"
    },
    {
      value: "use-as-example",
      icon: Eye,
      ariaLabel: "Set as example (key 3)",
      title: "File is a pattern or template (3)",
      keyHint: "3"
    },
  ];

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={onValueChange}
      variant="outline"
      className={cn("inline-flex", className)}
    >
      {states.map((state) => {
        const Icon = state.icon;
        return (
          <ToggleGroupItem
            key={state.value}
            value={state.value}
            aria-label={state.ariaLabel}
            title={state.title}
            className="!w-6 !h-6 !min-w-6 !px-0 flex items-center justify-center relative"
          >
            <Icon className="h-3 w-3" />
            {showKeyboardHints && (
              <span className="absolute -top-1 -right-1 text-[0.5rem] font-mono opacity-50 bg-background rounded px-0.5">
                {state.keyHint}
              </span>
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
