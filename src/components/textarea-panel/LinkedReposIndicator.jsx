import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Lamp } from "../instrument/Lamp";
import { repoRoleLabel } from "../../features/tabs/repoRoles";

// A toolbar badge, not a row under the well: linking a repo must not grow the
// pane. Links are toggled from the tabs pane.
export function LinkedReposIndicator({ linkedRepos }) {
  if (!linkedRepos?.length) return null;
  const count = linkedRepos.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 shrink-0 px-1.5 text-[11px] font-mono text-muted-foreground cursor-default">
          <Lamp state="on" />
          {count} repo{count !== 1 ? 's' : ''} linked
        </span>
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
        <div className="mt-1 text-muted-foreground font-sans">Unlink from the tabs pane</div>
      </TooltipContent>
    </Tooltip>
  );
}
