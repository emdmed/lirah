import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { repoRoleLabel } from "../../features/tabs/repoRoles";
import { ModeSegment, ModeClear } from "./ModeSegment";

// The prompt mode line's `repos N` segment. Linking happens in the tabs pane;
// × drops every link from this prompt.
export function LinkedReposIndicator({ linkedRepos, onClear }) {
  if (!linkedRepos?.length) return null;
  const count = linkedRepos.length;

  return (
    <span className="inline-flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <ModeSegment lit as="span" label={`${count} linked repo${count !== 1 ? 's' : ''}`}>
            repos <span className="tube">{count}</span>
          </ModeSegment>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md text-left font-mono text-xs">
          {linkedRepos.map((repo) => {
            const role = repoRoleLabel(repo.role);
            return (
              <div key={repo.path}>
                {repo.path}{role && <span className="text-muted-foreground"> · {role}</span>}
              </div>
            );
          })}
          <div className="mt-1 text-muted-foreground font-sans">Link more from the tabs pane</div>
        </TooltipContent>
      </Tooltip>
      {onClear && <ModeClear onClick={onClear} label="Unlink repos from this prompt" />}
    </span>
  );
}
