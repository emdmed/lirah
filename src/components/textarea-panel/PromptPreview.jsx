import { X } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

/**
 * Renders the exact payload the CLI agent will receive, section by section.
 *
 * This is the product's claim made visible: the string shown here is the same
 * string `usePromptSender` writes to the terminal, built by the same function.
 */
export function PromptPreview({ sections, text, onClearSection }) {
  const isEmpty = sections.length === 0;

  return (
    <div className="flex flex-col border edge-engraved bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b edge-b-engraved">
        <span className="engraved-label">Will be sent</span>
        <span className="flex items-baseline gap-1 text-[10px] font-mono">
          <span className={isEmpty ? 'tube-idle' : 'tube tube-change'}>
            {sections.length}
          </span>
          <span className="engraved-label">{sections.length === 1 ? 'part' : 'parts'}</span>
          <span className={isEmpty ? 'tube-idle' : 'tube tube-change'}>
            {text.length.toLocaleString()}
          </span>
          <span className="engraved-label">chars</span>
        </span>
      </div>

      {isEmpty ? (
        <p className="px-2 py-2 text-[10px] text-muted-foreground/70">
          Nothing yet. Type a prompt, select files, or pick a template.
        </p>
      ) : (
        <div className="flex flex-col overflow-y-auto max-h-[180px]">
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col border-b edge-b-engraved last:shadow-none">
              <div className="flex items-center justify-between gap-2 px-2 py-1 sticky top-0 bg-background/95">
                <span className="text-[10px] font-mono font-semibold text-foreground/70 truncate">
                  {section.label}
                  {section.count != null && (
                    <span className="ml-1 text-muted-foreground/70 font-normal">({section.count})</span>
                  )}
                </span>
                {section.clearable && onClearSection && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onClearSection(section.id)}
                        aria-label={`Remove ${section.label} from the prompt`}
                        className="flex items-center justify-center h-4 w-4 shrink-0 rounded-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Remove from prompt</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <pre className="px-2 pb-1.5 text-[10px] leading-[1.45] font-mono text-foreground/60 whitespace-pre-wrap break-words">
                {section.body}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
