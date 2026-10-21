import { TemplateSelector } from "./TemplateSelector";

// Prompt-level controls: the instructions picker (templates + patterns).
export function PromptToolbar({
  selectedTemplateId, onSelectTemplate, onManageTemplates, templateDropdownOpen, onTemplateDropdownOpenChange,
  patternFiles, selectedPatterns, onTogglePattern, onCreatePatterns,
}) {
  return (
    <div className="flex items-center gap-0.5">
      <TemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        onManageTemplates={onManageTemplates}
        open={templateDropdownOpen}
        onOpenChange={onTemplateDropdownOpenChange}
        patternFiles={patternFiles}
        selectedPatterns={selectedPatterns}
        onTogglePattern={onTogglePattern}
        onCreatePatterns={onCreatePatterns}
      />
    </div>
  );
}
