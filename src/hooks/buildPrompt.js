import { LARGE_FILE_INSTRUCTION } from "../features/file-groups";
import { escapeShellPath, getRelativePath } from "../utils/pathUtils";

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
  if (modifyFiles.length > 0) sections.push(formatFileSection('CAN_MODIFY', modifyFiles));
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
 * Builds the exact payload that gets written to the terminal.
 *
 * Pure: no Tauri calls, no state mutation, no side effects. It is called both
 * on send and continuously by the composer's preview, so the user reads the
 * same string the CLI agent will.
 *
 * Returns the assembled `text` plus the `sections` it was assembled from, in
 * order. `text` is exactly `sections.map(s => s.body).join('\n\n')` — the
 * preview cannot drift from the payload, because there is only one of them.
 */
export function buildPrompt({
  textareaContent,
  selectedFiles,
  currentPath,
  fileStates,
  selectedTemplateId,
  getTemplateById,
  formatFileAnalysis,
  getLineCount,
  getViewModeLabel,
  selectedElements,
  compactedProject,
  selectedPatterns,
  getPatternInstructions,
}) {
  const files = selectedFiles || new Set();
  const elements = selectedElements || new Map();

  const hasTextContent = !!textareaContent?.trim();
  const hasFiles = files.size > 0;
  const hasTemplate = !!selectedTemplateId;
  const hasElements = elements.size > 0;
  const hasCompactedProject = !!compactedProject?.output;

  const sections = [];

  if (hasCompactedProject) {
    const relativePath = compactedProject.filePath.replace(currentPath + '/', '');
    sections.push({
      id: 'compacted',
      label: 'COMPACTED PROJECT',
      body: `Grep inside ${relativePath} for relevant symbols/code before proceeding.`,
      clearable: true,
    });
  }

  if (hasTextContent) {
    sections.push({
      id: 'prompt',
      label: 'YOUR PROMPT',
      body: textareaContent,
      // Not clearable from here: the textarea below is already the control for
      // it, and a one-click wipe of typed prose is the wrong kind of undoable.
      clearable: false,
    });
  }

  if (hasFiles) {
    const filesString = buildFilesSections(files, currentPath, fileStates, {
      getLineCount, formatFileAnalysis, getViewModeLabel,
    });
    if (filesString) {
      sections.push({
        id: 'files',
        label: 'FILES',
        body: filesString,
        clearable: true,
        count: files.size,
      });
    }
  }

  if (hasElements) {
    const elementsOutput = buildElementsSections(elements, currentPath);
    if (elementsOutput.length > 0) {
      let count = 0;
      elements.forEach((els) => { count += els.length; });
      sections.push({
        id: 'elements',
        label: 'ELEMENTS',
        body: elementsOutput.join('\n\n'),
        clearable: true,
        count,
      });
    }
  }

  if (hasTemplate) {
    const template = getTemplateById(selectedTemplateId);
    if (template) {
      sections.push({
        id: 'template',
        label: `TEMPLATE · ${template.title}`,
        body: template.content,
        clearable: true,
      });
    }
  }

  if (selectedPatterns && selectedPatterns.size > 0) {
    const instructions = getPatternInstructions();
    if (instructions) {
      sections.push({
        id: 'patterns',
        label: 'PATTERNS',
        body: instructions,
        clearable: true,
        count: selectedPatterns.size,
      });
    }
  }

  return { sections, text: sections.map(s => s.body).join('\n\n') };
}
