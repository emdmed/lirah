import { useEffect } from "react";
import { Check, Settings, X } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
const GROUP_LABEL = "text-[10px] font-normal uppercase tracking-wider text-muted-foreground";

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
    ? `Instructions · ${activeParts.join(' · ')}  ·  Alt+Alt`
    : 'Instructions: templates and patterns  ·  Alt+Alt';

  return (
    <div className="flex items-center gap-1">
      {selectedTemplate && (
        <Badge
          variant="outline"
          className={`text-[11px] px-1.5 py-0 h-4.5 gap-0.5 cursor-pointer hover:bg-opacity-20 whitespace-nowrap font-semibold border-0 ${badgeStyle}`}
          onClick={() => onSelectTemplate(null)}
          title="Click to clear template  ·  Alt+Alt"
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
            aria-label={`Instructions (Alt+Alt)${activeParts.length ? `: ${activeParts.join(', ')}` : ''}`}
            title={triggerTitle}
            className="px-1.5"
          >
            instructions{patternCount > 0 && <span className="tube">:{patternCount}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60 text-xs">
          <DropdownMenuLabel className={GROUP_LABEL}>Templates (all projects)</DropdownMenuLabel>
          {templates.length === 0 ? (
            <DropdownMenuItem disabled className="text-[11px] text-muted-foreground pl-3">
              No templates yet
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => onSelectTemplate(null)}
                className="flex items-center justify-between text-[11px] py-1.5 pl-3"
              >
                <span className="text-muted-foreground">No template</span>
                {!selectedTemplateId && <Check className="h-3 w-3 text-[var(--ins-lamp)]" />}
              </DropdownMenuItem>
              {templates.map((template, index) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => onSelectTemplate(template.id)}
                  className={`flex items-center justify-between text-[11px] py-1.5 pl-3 ${selectedTemplateId === template.id ? 'ins-row-selected' : ''
                    }`}
                >
                  <span className="flex items-center">
                    {index < 9 && (
                      <span className="text-muted-foreground w-4 text-right mr-1.5">
                        {index + 1}
                      </span>
                    )}
                    <span className="truncate pr-2">{template.title}</span>
                  </span>
                  {selectedTemplateId === template.id && (
                    <Check className="h-3 w-3 text-[var(--ins-lamp)] flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuItem
            onClick={onManageTemplates}
            className="text-[11px] py-1.5 pl-3"
          >
            <Settings className="h-3 w-3 mr-1.5" />
            Manage templates…
          </DropdownMenuItem>
          {showPatterns && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={GROUP_LABEL}>Patterns (this repo)</DropdownMenuLabel>
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
