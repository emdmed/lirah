import { useCallback, useMemo, useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../../components/ui/dropdown-menu";
import { Scanner } from "../../components/instrument/Scanner";
import { useToast } from "../toast";

const ROW = "flex items-center justify-between text-[11px] py-1.5 pl-3";

function PatternRow({ filename, label, isSelected, onToggle }) {
  return (
    <DropdownMenuItem
      onClick={(e) => { e.preventDefault(); onToggle(filename); }}
      className={`${ROW} ${isSelected ? 'ins-row-selected' : ''}`}
    >
      <span className="truncate pr-2">{label}</span>
      <Check className={`h-3 w-3 flex-shrink-0 ${isSelected ? 'text-[var(--ins-lamp)]' : 'invisible'}`} />
    </DropdownMenuItem>
  );
}

// The repo's .patterns/*.md files as multi-select rows, rendered inside the
// instructions picker. Files in sub-folders open as submenus. With no
// patterns, offers to create .patterns/ with a starter.
export function PatternsMenuItems({ patternFiles, selectedPatterns, onTogglePattern, onCreatePatterns }) {
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const { rootFiles, groups } = useMemo(() => {
    const byDir = {};
    const root = [];
    patternFiles.forEach((filename) => {
      const slashIdx = filename.indexOf('/');
      if (slashIdx === -1) {
        root.push(filename);
      } else {
        const dir = filename.slice(0, slashIdx);
        (byDir[dir] ||= []).push(filename);
      }
    });
    return { rootFiles: root, groups: Object.entries(byDir) };
  }, [patternFiles]);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!onCreatePatterns || creating) return;
    setCreating(true);
    try {
      await onCreatePatterns();
      toast.success('Created .patterns/ with a starter conventions.md. Edit it to describe your rules.');
    } catch (err) {
      toast.error(`Could not create .patterns/: ${err?.message ?? err}`);
    } finally {
      setCreating(false);
    }
  }, [onCreatePatterns, creating, toast]);

  if (patternFiles.length === 0) {
    return (
      <DropdownMenuItem
        onClick={handleCreate}
        disabled={!onCreatePatterns || creating}
        className="flex items-start gap-1.5 text-[11px] py-1.5 pl-3"
      >
        {creating ? <Scanner className="mt-0.5" /> : <FolderPlus className="h-3 w-3 mt-0.5 flex-shrink-0" />}
        <span className="flex flex-col">
          <span className="text-muted-foreground">No patterns in this repo</span>
          <span>Create .patterns/</span>
        </span>
      </DropdownMenuItem>
    );
  }

  return (
    <>
      {rootFiles.map((filename) => (
        <PatternRow
          key={filename}
          filename={filename}
          label={filename.replace(/\.md$/, '')}
          isSelected={selectedPatterns.has(filename)}
          onToggle={onTogglePattern}
        />
      ))}
      {groups.map(([dir, files]) => (
        <DropdownMenuSub key={dir}>
          <DropdownMenuSubTrigger className="text-[11px] py-1.5 pl-3">
            <span className="truncate">{dir}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {files.map((filename) => (
              <PatternRow
                key={filename}
                filename={filename}
                label={filename.slice(dir.length + 1).replace(/\.md$/, '')}
                isSelected={selectedPatterns.has(filename)}
                onToggle={onTogglePattern}
              />
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
      <DropdownMenuItem
        disabled={selectedPatterns.size === 0}
        onClick={(e) => { e.preventDefault(); selectedPatterns.forEach(p => onTogglePattern(p)); }}
        className="text-[11px] py-1.5 pl-3 text-muted-foreground"
      >
        Clear patterns
      </DropdownMenuItem>
    </>
  );
}
