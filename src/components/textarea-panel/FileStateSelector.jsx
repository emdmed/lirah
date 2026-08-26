import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// Each state maps to a theme token, not a colour. Every theme defines all
// three, so this is correct in all of them — including the light ones — and a
// new theme needs no entry here.
const MODE_TOKENS = {
  'modify': 'text-primary bg-primary/12',
  'do-not-modify': 'text-destructive bg-destructive/12',
  'use-as-example': 'text-accent bg-accent/12',
};

/**
 * File state selector: three silkscreened segments on the panel.
 *
 * Every segment shows its own label at all times. Previously only the active
 * one did, which meant the other two options were unreadable until you clicked
 * them — the control could not be understood without operating it.
 *
 * No box is drawn around it; the active segment is lit, and that is the whole
 * affordance. Bloom is deliberately omitted here: at 10px caps a glow halo
 * smears the letterforms, and on this surface legibility outranks the effect.
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
      label: "EDIT",
      ariaLabel: "Agent may edit this file (key 1)",
      title: "Agent may edit this file (1)",
      keyHint: "1",
    },
    {
      value: "do-not-modify",
      label: "READ",
      ariaLabel: "Reference only, agent must not edit (key 2)",
      title: "Reference only — agent must not edit (2)",
      keyHint: "2",
    },
    {
      value: "use-as-example",
      label: "COPY",
      ariaLabel: "Follow this file as a pattern (key 3)",
      title: "Follow this file as a pattern (3)",
      keyHint: "3",
    },
  ];

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={onValueChange}
      variant="outline"
      className={cn("inline-flex gap-px", className)}
    >
      {states.map((state) => {
        const isActive = value === state.value;

        return (
          <ToggleGroupItem
            key={state.value}
            value={state.value}
            aria-label={state.ariaLabel}
            title={state.title}
            style={{ fontSize: 'var(--font-xs)' }}
            className={cn(
              "!h-4 !px-1 flex items-center justify-center relative rounded-none !border-0",
              "font-mono font-semibold leading-none tracking-[0.08em] transition-colors",
              isActive
                ? MODE_TOKENS[state.value]
                : "text-muted-foreground/45 hover:text-muted-foreground"
            )}
          >
            {state.label}
            {showKeyboardHints && (
              <span className="absolute -top-1.5 -right-0.5 text-[0.45rem] font-mono opacity-40 bg-background px-0.5">
                {state.keyHint}
              </span>
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
