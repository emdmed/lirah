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
import { usePromptTemplates } from "../../contexts/PromptTemplatesContext";

export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,
}) {
  const { templates } = usePromptTemplates();

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="flex items-center gap-1">
      {selectedTemplate && (
        <Badge
          variant="secondary"
          className="text-xs px-2 py-0 h-5 gap-1 cursor-pointer hover:bg-secondary/80 whitespace-nowrap"
          onClick={() => onSelectTemplate(null)}
          title="Click to clear template"
        >
          {selectedTemplate.title}
          <X className="h-3 w-3 flex-shrink-0" />
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6"
            aria-label="Select prompt template"
            title={selectedTemplate ? `Template: ${selectedTemplate.title}` : "Select prompt template"}
          >
            <FileText className={`h-4 w-4 ${selectedTemplateId ? 'text-primary' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        {templates.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            (No templates)
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() => onSelectTemplate(null)}
              className="flex items-center justify-between"
            >
              <span className="text-muted-foreground">(None)</span>
              {!selectedTemplateId && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onClick={() => onSelectTemplate(template.id)}
                className="flex items-center justify-between"
              >
                <span className="truncate">{template.title}</span>
                {selectedTemplateId === template.id && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManageTemplates}>
          <Settings className="h-4 w-4 mr-2" />
          Manage Templates...
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
