import { useEffect } from "react";
import { FileText, Check, Settings, X } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { usePromptTemplates } from "../../features/templates";

export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,
  open,           // Controlled open state
  onOpenChange,   // Callback to change open state
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

  // The badge takes the theme's own accent token, so it is correct in every
  // theme without a per-theme table to keep in sync.
  const badgeStyle = 'bg-primary/20 text-primary hover:bg-primary/30';

  return (
    <div className="flex items-center gap-1">
      {selectedTemplate && (
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 h-4.5 gap-0.5 cursor-pointer hover:bg-opacity-20 whitespace-nowrap font-semibold border edge-engraved ${badgeStyle}`}
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
            variant="outline"
            size="icon-sm"
            aria-label={selectedTemplate ? `Template: ${selectedTemplate.title} (Alt+Alt to clear)` : "Select prompt template (Alt+Alt)"}
            title={selectedTemplate ? `Template: ${selectedTemplate.title}  ·  Alt+Alt to clear` : "Select prompt template  ·  Alt+Alt"}
          >
            <FileText className={`h-3 w-3 ${selectedTemplateId ? 'text-primary' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-48 text-xs">
          {templates.length === 0 ? (
            <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
              No templates available
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => onSelectTemplate(null)}
                className="flex items-center justify-between text-[10px] py-1.5"
              >
                <span className="text-muted-foreground">No template</span>
                {!selectedTemplateId && <Check className="h-3 w-3 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {templates.map((template, index) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => onSelectTemplate(template.id)}
                  className={`flex items-center justify-between text-[10px] py-1.5 ${selectedTemplateId === template.id ? 'bg-primary/10' : ''
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
                    <Check className="h-3 w-3 text-primary flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onManageTemplates}
            className="text-[10px] py-1.5"
          >
            <Settings className="h-3 w-3 mr-1.5" />
            Manage Templates...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
