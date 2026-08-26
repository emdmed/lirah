import { TemplateSelector } from "./TemplateSelector";

export function PromptToolbar({ selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange }) {
  return (
    <div className="flex items-center gap-1 rounded-none py-1">
      <TemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        onManageTemplates={onManageTemplates}
        open={templateDropdownOpen}
        onOpenChange={onTemplateDropdownOpenChange}
      />
    </div>
  );
}
