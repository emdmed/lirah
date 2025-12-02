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
 */
export function FileStateSelector({ value, onValueChange, className }) {
  const states = [
    {
      value: "modify",
      icon: Pencil,
      ariaLabel: "Set as modifiable",
      title: "File will be modified"
    },
    {
      value: "do-not-modify",
      icon: Ban,
      ariaLabel: "Set as excluded",
      title: "File is reference only, do not modify"
    },
    {
      value: "use-as-example",
      icon: Eye,
      ariaLabel: "Set as example",
      title: "File is a pattern or template"
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
            className="!w-6 !h-6 !min-w-6 !px-0 flex items-center justify-center"
          >
            <Icon className="h-3 w-3" />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
