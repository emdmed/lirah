import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Pencil, Ban, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

// Per-theme color maps for each file mode
const MODE_COLORS = {
  modify: {
    kanagawa:      { bg: 'bg-[#76946A]/20', text: 'text-[#76946A]', border: 'border-[#76946A]/40' },
    light:         { bg: 'bg-[#587539]/20', text: 'text-[#587539]', border: 'border-[#587539]/40' },
    dracula:       { bg: 'bg-[#50fa7b]/20', text: 'text-[#50fa7b]', border: 'border-[#50fa7b]/40' },
    monokai:       { bg: 'bg-[#a6e22e]/20', text: 'text-[#a6e22e]', border: 'border-[#a6e22e]/40' },
    'emerald-mono':{ bg: 'bg-[#34d399]/20', text: 'text-[#34d399]', border: 'border-[#34d399]/40' },
    gruvbox:       { bg: 'bg-[#b8bb26]/20', text: 'text-[#b8bb26]', border: 'border-[#b8bb26]/40' },
  },
  'do-not-modify': {
    kanagawa:      { bg: 'bg-[#DCA561]/20', text: 'text-[#DCA561]', border: 'border-[#DCA561]/40' },
    light:         { bg: 'bg-[#c18401]/20', text: 'text-[#c18401]', border: 'border-[#c18401]/40' },
    dracula:       { bg: 'bg-[#ffb86c]/20', text: 'text-[#ffb86c]', border: 'border-[#ffb86c]/40' },
    monokai:       { bg: 'bg-[#fd971f]/20', text: 'text-[#fd971f]', border: 'border-[#fd971f]/40' },
    'emerald-mono':{ bg: 'bg-[#fbbf24]/20', text: 'text-[#fbbf24]', border: 'border-[#fbbf24]/40' },
    gruvbox:       { bg: 'bg-[#fe8019]/20', text: 'text-[#fe8019]', border: 'border-[#fe8019]/40' },
  },
  'use-as-example': {
    kanagawa:      { bg: 'bg-[#7E9CD8]/20', text: 'text-[#7E9CD8]', border: 'border-[#7E9CD8]/40' },
    light:         { bg: 'bg-[#5e81ac]/20', text: 'text-[#5e81ac]', border: 'border-[#5e81ac]/40' },
    dracula:       { bg: 'bg-[#bd93f9]/20', text: 'text-[#bd93f9]', border: 'border-[#bd93f9]/40' },
    monokai:       { bg: 'bg-[#ae81ff]/20', text: 'text-[#ae81ff]', border: 'border-[#ae81ff]/40' },
    'emerald-mono':{ bg: 'bg-[#60a5fa]/20', text: 'text-[#60a5fa]', border: 'border-[#60a5fa]/40' },
    gruvbox:       { bg: 'bg-[#83a598]/20', text: 'text-[#83a598]', border: 'border-[#83a598]/40' },
  },
};

function getModeColor(mode, themeName) {
  const key = themeName?.toLowerCase() || 'kanagawa';
  return MODE_COLORS[mode]?.[key] || MODE_COLORS[mode]?.kanagawa || { bg: '', text: '', border: '' };
}

/**
 * File state selector using shadcn ToggleGroup
 * Provides a color-coded segmented control for selecting file states
 *
 * @param {Object} props
 * @param {'modify'|'do-not-modify'|'use-as-example'} props.value - Current active state
 * @param {Function} props.onValueChange - Callback when state changes: (newState) => void
 * @param {boolean} props.showKeyboardHints - Whether to show keyboard shortcut hints
 */
export function FileStateSelector({ value, onValueChange, className, showKeyboardHints = false }) {
  const { theme } = useTheme();
  const themeName = theme.name;

  const states = [
    {
      value: "modify",
      icon: Pencil,
      label: "MOD",
      ariaLabel: "Set as modifiable (key 1)",
      title: "File will be modified (1)",
      keyHint: "1"
    },
    {
      value: "do-not-modify",
      icon: Ban,
      label: "REF",
      ariaLabel: "Set as excluded (key 2)",
      title: "File is reference only, do not modify (2)",
      keyHint: "2"
    },
    {
      value: "use-as-example",
      icon: Eye,
      label: "EX",
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
      className={cn("inline-flex border border-dashed border-foreground/20 rounded-none p-px gap-px", className)}
    >
      {states.map((state) => {
        const Icon = state.icon;
        const isActive = value === state.value;
        const colors = getModeColor(state.value, themeName);

        return (
          <ToggleGroupItem
            key={state.value}
            value={state.value}
            aria-label={state.ariaLabel}
            title={state.title}
            className={cn(
              "!h-4 !w-8 !px-0.5 flex items-center justify-center gap-px relative rounded-sm transition-colors !border-0",
              isActive
                ? `${colors.bg} ${colors.text}`
                : "opacity-40 hover:opacity-70"
            )}
          >
            <Icon className="h-2 w-2 flex-shrink-0" />
            {isActive && (
              <span className="text-[8px] font-mono font-semibold leading-none">
                {state.label}
              </span>
            )}
            {showKeyboardHints && (
              <span className="absolute -top-1.5 -right-1 text-[0.45rem] font-mono opacity-40 bg-background rounded-sm px-0.5">
                {state.keyHint}
              </span>
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

// Export for external use (e.g. SidebarFileSelection badge styling)
export { getModeColor, MODE_COLORS };
