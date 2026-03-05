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
      
      // Save compacted output to .orchestration/tools/
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const projectName = currentPath.split('/').pop() || 'project';
      const fileName = `compacted_${projectName}_${timestamp}.md`;
      const filePath = `${currentPath}/.orchestration/tools/${fileName}`;
      
      // Ensure directory exists
      try {
        await invoke('read_directory', { path: `${currentPath}/.orchestration/tools` });
      } catch {
        // Directory might not exist, create it
        try {
          await invoke('write_file_content', { 
            path: `${currentPath}/.orchestration/tools/.gitkeep`, 
            content: '' 
          });
        } catch (dirErr) {
          console.warn('Could not create .orchestration/tools directory:', dirErr);
        }
      }
      
      // Write the compacted content to file
      await invoke('write_file_content', { path: filePath, content: output });
      
      const compactedTokens = estimateTokens(output);
      const originalTokens = Math.ceil(originalSize / 4);
      const fileCount = (output.match(/^## /gm) || []).length;
      const compressionPercent = originalSize > 0
        ? Math.round((1 - output.length / originalSize) * 100)
        : 0;

      const compacted = {
        filePath,
        fileName,
        output, // Keep for backward compatibility with CompactSectionsDialog
        fullOutput: output,
        fileCount,
        tokenEstimate: compactedTokens,
        formattedTokens: formatTokenCount(compactedTokens),
        originalTokens,
        formattedOriginalTokens: formatTokenCount(originalTokens),
        compressionPercent,
        disabledPaths: [],
      };
      setCompactedProject(compacted);
      setTextareaVisible(true);
      return compacted;
    } catch (error) {
      console.error('Failed to compact project:', error);
      return null;
    }
  }, [isCompacting, currentPath, allFiles, compactProject, setTextareaVisible]);

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
