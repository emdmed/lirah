import { TemplateSelector } from "./TemplateSelector";

export function PromptToolbar({ selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange }) {
  return (
    <div className="flex items-center gap-0.5">
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
