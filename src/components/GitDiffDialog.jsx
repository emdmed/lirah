import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { DiffContent } from './DiffContent';
import { Loader2 } from 'lucide-react';

// Map file extensions to Prism language names
const extensionToLanguage = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.css': 'css',
  '.scss': 'css',
  '.json': 'json',
  '.rs': 'rust',
  '.py': 'python',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};

/**
 * Get language from file path extension
 */
function getLanguageFromPath(filePath) {
  if (!filePath) return null;
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = filePath.slice(lastDot).toLowerCase();
  return extensionToLanguage[ext] || null;
}

/**
 * Dialog that shows side-by-side git diff for a specific file
 * @param {boolean} open - Whether dialog is open
 * @param {function} onOpenChange - Callback when open state changes
 * @param {string} filePath - Absolute path to the file
 * @param {string} repoPath - Path to the git repository root
 */
export function GitDiffDialog({ open, onOpenChange, filePath, repoPath }) {
  const [diffResult, setDiffResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && filePath && repoPath) {
      fetchDiff();
    } else {
      // Reset state when dialog closes
      setDiffResult(null);
      setError(null);
    }
  }, [open, filePath, repoPath]);

  const fetchDiff = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke('get_git_diff', {
        filePath,
        repoPath,
      });
      setDiffResult(result);
    } catch (err) {
      console.error('Failed to fetch git diff:', err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  // Extract filename from path for display
  const fileName = filePath ? filePath.split('/').pop() : '';
  const relativePath = filePath && repoPath
    ? filePath.replace(repoPath + '/', '')
    : filePath;

  // Detect language for syntax highlighting
  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);

  // Ref for scroll container to track scroll position
  const scrollContainerRef = useRef(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {fileName}
            {diffResult?.is_new_file && (
              <span className="ml-2 text-xs text-green-500 font-normal">(new file)</span>
            )}
            {diffResult?.is_deleted_file && (
              <span className="ml-2 text-xs text-red-500 font-normal">(deleted)</span>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs truncate">
            {relativePath}
            {diffResult && (
              <span className="ml-2">
                <span className="text-green-500">+{diffResult.added_lines}</span>
                {' '}
                <span className="text-red-500">-{diffResult.deleted_lines}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-auto border rounded-md bg-background"
        >
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-400">
              <p className="font-medium">Failed to load diff</p>
              <p className="text-xs mt-1 text-muted-foreground">{error}</p>
            </div>
          ) : diffResult ? (
            <DiffContent
              oldContent={diffResult.old_content}
              newContent={diffResult.new_content}
              isNewFile={diffResult.is_new_file}
              isDeletedFile={diffResult.is_deleted_file}
              language={language}
              scrollContainerRef={scrollContainerRef}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
