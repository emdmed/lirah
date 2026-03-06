import { TemplateSelector } from "./TemplateSelector";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

export function PromptToolbar({ selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange }) {
  return (
    <div className="flex items-center gap-1 rounded  py-1">
      <TemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        onManageTemplates={onManageTemplates}
        open={templateDropdownOpen}
        onOpenChange={onTemplateDropdownOpenChange}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground/40 text-[10px] cursor-help px-1">Alt+Alt</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span className="text-xs">Double-tap Alt to {selectedTemplateId ? 'clear' : 'open'}</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
