import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { ModeSegment, ModeClear, ModeSep } from "./ModeSegment";
import { LinkedReposIndicator } from "./LinkedReposIndicator";
import { ElementsTooltipContent } from "./ElementsTooltipContent";

/**
 * The context half of the line under the prompt: everything the next send
 * carries besides the typed text and its instructions:
 * `ctx 3 · elements 4 × · repos 1 × · compacted × · keep`.
 * Each segment is the control for its own state. Instructions have their own
 * key beside this line, so they are not repeated here.
 */
export function PromptModeLine({
  fileCount = 0,
  chipsOpen = false,
  onToggleChips,
  elementCount = 0,
  selectedElements,
  currentPath,
  onClearElements,
  linkedRepos,
  onClearRepos,
  compactedProject,
  onOpenCompacted,
  onClearCompacted,
  keepFilesAfterSend = false,
  onToggleKeepFiles,
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0" role="group" aria-label="Prompt context">
      <ModeSegment
        lit={fileCount > 0}
        pressed={chipsOpen}
        aria-expanded={chipsOpen}
        onClick={onToggleChips}
        label={`${fileCount} context file${fileCount !== 1 ? 's' : ''}. ${chipsOpen ? 'Hide' : 'Show'} the list`}
      >
        ctx <span className={fileCount > 0 ? 'tube' : 'tube-idle'}>{fileCount}</span>
      </ModeSegment>


      {elementCount > 0 && (
        <>
          <ModeSep />
          <span className="inline-flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <ModeSegment lit as="span" label={`${elementCount} code element${elementCount !== 1 ? 's' : ''}`}>
                  elements <span className="tube">{elementCount}</span>
                </ModeSegment>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-md text-left p-3">
                <ElementsTooltipContent selectedElements={selectedElements} currentPath={currentPath} />
              </TooltipContent>
            </Tooltip>
            {onClearElements && <ModeClear onClick={onClearElements} label="Remove all code elements" />}
          </span>
        </>
      )}

      {linkedRepos?.length > 0 && (
        <>
          <ModeSep />
          <LinkedReposIndicator linkedRepos={linkedRepos} onClear={onClearRepos} />
        </>
      )}

      {compactedProject && (
        <>
          <ModeSep />
          <span className="inline-flex items-center">
            <ModeSegment
              lit
              onClick={onOpenCompacted}
              label={`Compacted project, ${compactedProject.formattedTokens} tokens. Choose sections`}
              title="Choose which sections go in"
            >
              compacted <span className="tube">{compactedProject.formattedTokens}</span>
            </ModeSegment>
            {onClearCompacted && <ModeClear onClick={onClearCompacted} label="Remove the compacted project" />}
          </span>
        </>
      )}

      {onToggleKeepFiles && (
        <>
          <ModeSep />
          <ModeSegment
            lit={keepFilesAfterSend}
            lamp={keepFilesAfterSend ? 'ok' : 'off'}
            pressed={keepFilesAfterSend}
            onClick={() => onToggleKeepFiles(!keepFilesAfterSend)}
            label={keepFilesAfterSend ? 'Keeping context after send. Turn off' : 'Context is cleared after send. Keep it'}
            title={keepFilesAfterSend ? 'Files, elements and repos stay attached after send' : 'Files, elements and repos are cleared after send'}
          >
            keep
          </ModeSegment>
        </>
      )}
    </div>
  );
}
