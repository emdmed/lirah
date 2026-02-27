// Re-export all file-analysis related functionality

// Components
export { ElementPickerDialog } from './ElementPickerDialog';

// Hooks
export { useElementPicker } from './useElementPicker';
export { useFileSymbols, VIEW_MODES } from './useFileSymbols';

// Babel symbol parsing
export {
  isBabelParseable,
  extractSymbols,
  formatSymbolsForPrompt,
  extractSignatures,
  formatSignaturesForPrompt,
  extractSkeleton,
  formatSkeletonForPrompt,
} from './babelSymbolParser';

// Python symbol parsing
export {
  isPythonParseable,
  extractSkeleton as extractPythonSkeleton,
  formatSkeletonForPrompt as formatPythonSkeletonForPrompt,
} from './pythonSymbolParser';
