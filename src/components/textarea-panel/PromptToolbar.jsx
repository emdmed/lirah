import { TemplateSelector } from "./TemplateSelector";

// Prompt-level controls: the instructions picker (templates).
export function PromptToolbar({
  selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange,
  showSelectedBadge = true,
}) {
  return (
    <div className="flex items-center gap-0.5">
      <TemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        onManageTemplates={onManageTemplates}
        open={templateDropdownOpen}
        onOpenChange={onTemplateDropdownOpenChange}
        showSelectedBadge={showSelectedBadge}
      />
    </div>
  );
}
