import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { PickerRow, tildePath } from "./ui/picker";
import { shortcutForCommand } from "../lib/shortcuts";

// In a workspace, commit, merge and lazygit ask which project to act on.
const ACTIONS = {
  lazygit: { title: "Lazygit", command: "lazygit" },
  autocommit: { title: "Auto commit", command: "commit" },
  automerge: { title: "Auto merge", command: "merge" },
};

export function WorkspaceProjectPicker({ open = true, onOpenChange, projects, onSelect, action }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef(null);
  const meta = ACTIONS[action];

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : projects.length - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < projects.length - 1 ? prev + 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (projects[selectedIndex]) onSelect(projects[selectedIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        keys={meta ? shortcutForCommand(meta.command) ?? undefined : undefined}
        status={`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        hints={[{ keys: ["↑", "↓"], label: "move" }, { keys: ["↵"], label: "pick" }]}
        escLabel="cancel"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle>{meta ? `${meta.title} · pick project` : "Pick project"}</DialogTitle>
        <DialogDescription className="sr-only">Choose the workspace project to act on.</DialogDescription>

        <div className="-mx-2 flex max-h-[320px] flex-col overflow-y-auto" role="listbox" aria-label="Projects">
          {projects.map((project, index) => {
            const selected = index === selectedIndex;
            return (
              <PickerRow
                key={project.name}
                ref={selected ? selectedRef : null}
                selected={selected}
                glyph={selected ? "↵" : ""}
                name={project.name}
                path={tildePath(project.real_path || project.path)}
                onClick={() => onSelect(project)}
                onMouseMove={() => setSelectedIndex(index)}
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
