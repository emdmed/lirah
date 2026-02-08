import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveLastPrompt } from "./useTextareaShortcuts";
import { LARGE_FILE_INSTRUCTION } from "../components/sidebar/SidebarFileSelection";

function escapeShellPath(path) {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

function getRelativePath(absolutePath, cwdPath) {
  const normalizedCwd = cwdPath.endsWith('/') ? cwdPath.slice(0, -1) : cwdPath;
  const normalizedFile = absolutePath.endsWith('/') ? absolutePath.slice(0, -1) : absolutePath;

  if (normalizedFile.startsWith(normalizedCwd + '/')) {
    return normalizedFile.slice(normalizedCwd.length + 1);
  }

  if (normalizedFile === normalizedCwd) {
    return '.';
  }

  return absolutePath;
}

function buildFilesSections(selectedFiles, currentPath, fileStates, { getLineCount, formatFileAnalysis, getViewModeLabel }) {
  const fileArray = Array.from(selectedFiles);
  const modifyFiles = [];
  const doNotModifyFiles = [];
  const exampleFiles = [];

  fileArray.forEach(absolutePath => {
    const relativePath = getRelativePath(absolutePath, currentPath);
    const escapedPath = escapeShellPath(relativePath);
    const state = fileStates.get(absolutePath) || 'modify';

    const lineCount = getLineCount(absolutePath);
    const analysisStr = lineCount >= 300 ? formatFileAnalysis(absolutePath) : '';
    const modeLabel = lineCount >= 300 ? getViewModeLabel(absolutePath) : null;

    const fileEntry = { path: escapedPath, analysis: analysisStr, modeLabel };

    if (state === 'modify') {
      modifyFiles.push(fileEntry);
    } else if (state === 'do-not-modify') {
      doNotModifyFiles.push(fileEntry);
    } else if (state === 'use-as-example') {
      exampleFiles.push(fileEntry);
    }
  });

  const formatFileSection = (label, files) => {
    return files.map(f => {
      let entry = `${label}: ${f.path}`;
      if (f.analysis) {
        const header = f.modeLabel || 'Analysis';
        entry += `\n  ${header}:\n${f.analysis}`;
      }
      return entry;
    }).join('\n\n');
  };

  const sections = [];
  if (modifyFiles.length > 0) sections.push(formatFileSection('MODIFY', modifyFiles));
  if (doNotModifyFiles.length > 0) sections.push(formatFileSection('DO_NOT_MODIFY', doNotModifyFiles));
  if (exampleFiles.length > 0) sections.push(formatFileSection('USE_AS_EXAMPLE', exampleFiles));

  const allFiles = [...modifyFiles, ...doNotModifyFiles, ...exampleFiles];
  const hasDigests = allFiles.some(f => f.analysis);

  let filesString = sections.join('\n\n');
  if (hasDigests) {
    filesString += LARGE_FILE_INSTRUCTION;
  }

  return filesString;
}

function buildElementsSections(selectedElements, currentPath) {
  const elementsOutput = [];
  selectedElements.forEach((elements, filePath) => {
    if (elements.length === 0) return;
    const relativePath = getRelativePath(filePath, currentPath);
    const escapedPath = escapeShellPath(relativePath);
    const elementLines = elements.map(el => {
      const lineInfo = el.line === el.endLine
        ? `line ${el.line}`
        : `lines ${el.line}-${el.endLine}`;
      return `  - ${el.displayName} (${el.type}): ${lineInfo}`;
    });
    elementsOutput.push(`ELEMENTS from ${escapedPath}:\n${elementLines.join('\n')}`);
  });
  return elementsOutput;
}

/**
 * Hook that builds and sends prompts to the terminal.
 */
export function usePromptSender({
  terminalSessionId,
  terminalRef,
  textareaContent,
  selectedFiles,
  currentPath,
  fileStates,
  keepFilesAfterSend,
  selectedTemplateId,
  getTemplateById,
  appendOrchestration,
  formatFileAnalysis,
  getLineCount,
  getViewModeLabel,
  selectedElements,
  compactedProject,
  // State setters (callbacks)
  setTextareaContent,
  setCompactedProject,
  clearFileSelection,
  clearSelectedElements,
}) {
  const sendPrompt = useCallback(async () => {
    if (!terminalSessionId) return;

    const hasTextContent = textareaContent?.trim();
    const hasFiles = selectedFiles.size > 0;
    const hasTemplate = !!selectedTemplateId;
    const hasElements = selectedElements.size > 0;
    const hasCompactedProject = !!compactedProject?.output;

    if (!hasTextContent && !hasFiles && !hasTemplate && !hasElements && !hasCompactedProject) {
      return;
    }

    try {
      let fullCommand = '';

      // Add compacted project at the beginning if it exists
      if (hasCompactedProject) {
        fullCommand = compactedProject.output;
      }

      if (hasTextContent) {
        if (fullCommand) {
          fullCommand += '\n\n' + textareaContent;
        } else {
          fullCommand = textareaContent;
        }
      }

      if (hasFiles) {
        const filesString = buildFilesSections(selectedFiles, currentPath, fileStates, {
          getLineCount, formatFileAnalysis, getViewModeLabel
        });

        if (hasTextContent) {
          fullCommand = `${filesString}\n\n${textareaContent}`;
        } else {
          fullCommand = filesString;
        }
      }

      // Add selected elements from element picker
      if (hasElements) {
        const elementsOutput = buildElementsSections(selectedElements, currentPath);
        if (elementsOutput.length > 0) {
          const elementsString = elementsOutput.join('\n\n');
          const separator = fullCommand.trim() ? '\n\n' : '';
          fullCommand = fullCommand + separator + elementsString;
        }
      }

      // Append selected template content if any
      if (selectedTemplateId) {
        const template = getTemplateById(selectedTemplateId);
        if (template) {
          const separator = fullCommand.trim() ? '\n\n' : '';
          fullCommand = fullCommand + separator + template.content;
        }
      }

      // Append orchestration prompt if checkbox is checked
      if (appendOrchestration) {
        const separator = fullCommand.trim() ? '\n\n' : '';
        fullCommand = fullCommand + separator + 'Read and follow .orchestration/orchestration.md';
      }

      // Send text content first
      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: fullCommand
      });

      // Small delay then send Enter (carriage return) to submit
      setTimeout(async () => {
        try {
          await invoke('write_to_terminal', {
            sessionId: terminalSessionId,
            data: '\r'
          });
        } catch (error) {
          console.error('Failed to send Enter:', error);
        }
      }, 500);

      console.log('Sent to terminal:', fullCommand);

      // Focus terminal
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }

      // Save prompt before clearing (for Ctrl+Z restore)
      saveLastPrompt(textareaContent);

      // Clear textarea content (always)
      setTextareaContent('');

      // Clear file selection only if persistence is disabled
      if (!keepFilesAfterSend) {
        clearFileSelection();
        clearSelectedElements();
      }

      // Clear compacted project after sending
      setCompactedProject(null);
    } catch (error) {
      console.error('Failed to send to terminal:', error);
    }
  }, [terminalSessionId, textareaContent, selectedFiles, currentPath, fileStates, keepFilesAfterSend, selectedTemplateId, getTemplateById, appendOrchestration, formatFileAnalysis, getLineCount, getViewModeLabel, selectedElements, clearSelectedElements, compactedProject, setCompactedProject, terminalRef, setTextareaContent, clearFileSelection]);

  return sendPrompt;
}
