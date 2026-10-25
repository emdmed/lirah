import { useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Keycap } from "../instrument/Keycap";
import { Lamp } from "../instrument/Lamp";
import { joinKeys } from "../instrument/FrameHints";
import { shortcutKeys } from "../../lib/shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { usePromptTemplates } from "../../features/templates";
import { PatternsMenuItems } from "../../features/patterns/PatternsSelector";

const NO_PATTERN_FILES = [];
const NO_PATTERNS = new Set();
const OPEN_KEYS = joinKeys(shortcutKeys("templates") ?? ["alt", "alt"]);

// The "instructions" picker: one dropdown for everything that tells the agent
// how to work. Templates (global, single-select) are text added to the
// prompt; patterns (this repo's .patterns/*.md, multi-select) are sent as
// "Read and follow" references. Alt+Alt opens it (controlled `open`).
export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,
  open,           // Controlled open state
  onOpenChange,   // Callback to change open state
  patternFiles = NO_PATTERN_FILES,
  selectedPatterns = NO_PATTERNS,
  onTogglePattern,
  onCreatePatterns,
  // Off where the selected template is already shown (the context pane's chips).
  showSelectedBadge = true,
}) {
  const { templates } = usePromptTemplates();

  // Handle number key presses when dropdown is open
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        const index = num - 1;
        if (index < templates.length) {
          e.preventDefault();
          onSelectTemplate(templates[index].id);
          onOpenChange?.(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, templates.length, onSelectTemplate, onOpenChange]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const patternCount = selectedPatterns.size;
  const showPatterns = !!onTogglePattern;

  // An active template is a lit state: lamp-coloured outline, no fill.
  const badgeStyle = 'text-[var(--ins-lamp)] shadow-[inset_0_0_0_1px_var(--ins-lamp)] hover:bg-foreground/10';

  const activeParts = [
    selectedTemplate && `template: ${selectedTemplate.title}`,
    patternCount > 0 && `patterns: ${Array.from(selectedPatterns).map(f => f.replace(/\.md$/, '')).join(', ')}`,
  ].filter(Boolean);
  const triggerTitle = activeParts.length > 0
    ? `Instructions · ${activeParts.join(' · ')}  ·  ${OPEN_KEYS}`
    : `Instructions: templates and patterns  ·  ${OPEN_KEYS}`;

  return (
    <div className="flex items-center gap-1">
      {selectedTemplate && showSelectedBadge && (
        <Badge
          variant="outline"
          className={`text-[11px] px-1.5 py-0 h-4.5 gap-0.5 cursor-pointer hover:bg-opacity-20 whitespace-nowrap font-semibold border-0 ${badgeStyle}`}
          onClick={() => onSelectTemplate(null)}
          title={`Click to clear template  ·  ${OPEN_KEYS}`}
        >
          {selectedTemplate.title}
          <X className="h-2.5 w-2.5 flex-shrink-0 hover:opacity-70" />
        </Badge>
      )}
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            data-lit={activeParts.length > 0 || undefined}
            aria-label={`Instructions (${OPEN_KEYS})${activeParts.length ? `: ${activeParts.join(', ')}` : ''}`}
            title={triggerTitle}
            className="gap-1 px-1.5"
          >
            <span>instructions{patternCount > 0 && <span className="tube">:{patternCount}</span>}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60 text-xs">
          <DropdownMenuLabel>templates · all projects</DropdownMenuLabel>
          {templates.length === 0 ? (
            <DropdownMenuItem disabled className="tui-dialog-empty text-[11px] pl-3 data-[disabled]:opacity-100">
              <span className="tui-dialog-empty-star" aria-hidden="true" />
              No templates yet
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => onSelectTemplate(null)}
                className="flex items-center justify-between text-[11px] py-1.5 pl-3"
              >
                <span className="text-muted-foreground">No template</span>
                {!selectedTemplateId && <Lamp state="on" label="Selected" />}
              </DropdownMenuItem>
              {templates.map((template, index) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => onSelectTemplate(template.id)}
                  className={`flex items-center justify-between text-[11px] py-1.5 pl-3 ${selectedTemplateId === template.id ? 'ins-row-selected' : ''
                    }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {index < 9 ? (
                      <Keycap size="sm">{index + 1}</Keycap>
                    ) : (
                      <span className="w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate pr-2">{template.title}</span>
                  </span>
                  {selectedTemplateId === template.id && <Lamp state="on" label="Selected" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuItem
            onClick={onManageTemplates}
            className="text-[11px] py-1.5 pl-3"
          >
            Manage templates…
          </DropdownMenuItem>
          {showPatterns && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>patterns · this repo</DropdownMenuLabel>
              <PatternsMenuItems
                patternFiles={patternFiles}
                selectedPatterns={selectedPatterns}
                onTogglePattern={onTogglePattern}
                onCreatePatterns={onCreatePatterns}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
