import { useMemo } from "react";
import { getRelativePath } from "../../utils/pathUtils";

export function ElementsTooltipContent({ selectedElements, currentPath }) {
  const fileEntries = useMemo(() => {
    if (!selectedElements || selectedElements.size === 0) return [];
    const entries = [];
    selectedElements.forEach((elements, filePath) => {
      entries.push({
        path: getRelativePath(filePath, currentPath),
        elements
      });
    });
    return entries;
  }, [selectedElements, currentPath]);

  if (fileEntries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {fileEntries.map(({ path, elements }) => (
        <div key={path}>
          <div className="text-primary font-medium mb-1">{path}</div>
          <div className="flex flex-col gap-0.5 pl-2 border-l border-border/30">
            {elements.map(el => {
              const lineInfo = el.line === el.endLine ? `${el.line}` : `${el.line}-${el.endLine}`;
              return (
                <div key={el.key} className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{el.type}</span>
                  <span className="text-foreground">{el.displayName}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{lineInfo}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
