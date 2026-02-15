import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectCompact, estimateTokens, formatTokenCount } from "./useProjectCompact";

export function useCompact({ currentPath, allFiles, setTextareaVisible }) {
  const { isCompacting, progress: compactProgress, compactProject } = useProjectCompact();
  const [compactedProject, setCompactedProject] = useState(null);

  const handleCompactProject = useCallback(async () => {
    if (isCompacting || !currentPath) return;

    try {
      let files = allFiles;
      if (!files || files.length === 0) {
        files = await invoke('read_directory_recursive', {
          path: currentPath,
          maxDepth: 10,
          maxFiles: 10000
        });
      }

      const result = await compactProject(currentPath, files);
      if (!result) return;

      const { output, originalSize } = result;
      const compactedTokens = estimateTokens(output);
      const originalTokens = Math.ceil(originalSize / 4);
      const fileCount = (output.match(/^## /gm) || []).length;
      const compressionPercent = originalSize > 0
        ? Math.round((1 - output.length / originalSize) * 100)
        : 0;

      setCompactedProject({
        output,
        fullOutput: output,
        fileCount,
        tokenEstimate: compactedTokens,
        formattedTokens: formatTokenCount(compactedTokens),
        originalTokens,
        formattedOriginalTokens: formatTokenCount(originalTokens),
        compressionPercent,
        disabledPaths: [],
      });
      setTextareaVisible(true);
    } catch (error) {
      console.error('Failed to compact project:', error);
    }
  }, [isCompacting, currentPath, allFiles, compactProject]);

  const handleCancelCompact = useCallback(() => {
    setCompactedProject(null);
  }, []);

  return {
    isCompacting,
    compactProgress,
    compactedProject, setCompactedProject,
    handleCompactProject,
    handleCancelCompact,
  };
}
