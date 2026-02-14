import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

function formatTypeCheckErrors(result) {
  const lines = [];

  lines.push(`Type Check Results: ${result.file_path}`);
  lines.push(`Errors: ${result.error_count}, Warnings: ${result.warning_count}`);
  lines.push(`Duration: ${result.execution_time_ms}ms`);
  lines.push('');

  const errors = result.errors.filter(e => e.severity === 'error');
  const warnings = result.errors.filter(e => e.severity === 'warning');

  if (errors.length > 0) {
    lines.push('ERRORS:');
    errors.forEach(err => {
      lines.push(`  Line ${err.line}, Col ${err.column}: ${err.code}`);
      lines.push(`    ${err.message}`);
    });
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('WARNINGS:');
    warnings.forEach(warn => {
      lines.push(`  Line ${warn.line}, Col ${warn.column}: ${warn.code}`);
      lines.push(`    ${warn.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Hook for running TypeScript type checks on files.
 * @param {string} currentPath - Project root path
 * @param {object} callbacks - { setTextareaVisible, setTextareaContent }
 */
export function useTypeChecker(currentPath, { setTextareaVisible, setTextareaContent }) {
  const [typeCheckResults, setTypeCheckResults] = useState(new Map());
  const [checkingFiles, setCheckingFiles] = useState(new Set());
  const [successfulChecks, setSuccessfulChecks] = useState(new Set());

  const checkFileTypes = useCallback(async (filePath) => {
    if (checkingFiles.has(filePath)) {
      return;
    }

    console.log('🔍 Starting type check for:', filePath);
    setCheckingFiles(prev => new Set(prev).add(filePath));

    try {
      const result = await invoke('check_file_types', {
        filePath: filePath,
        projectRoot: currentPath
      });

      console.log('✅ Type check result:', result);
      setTypeCheckResults(prev => new Map(prev).set(filePath, result));

      if (result.error_count > 0 || result.warning_count > 0) {
        console.log(`⚠️ Found ${result.error_count} errors and ${result.warning_count} warnings`);
        setTextareaVisible(true);

        const errorText = formatTypeCheckErrors(result);
        setTextareaContent(prev => {
          const separator = prev.trim() ? '\n\n---\n\n' : '';
          return prev + separator + errorText;
        });
      } else {
        console.log('✨ No errors found! Showing green button for 3 seconds');
        setSuccessfulChecks(prev => new Set(prev).add(filePath));

        setTimeout(() => {
          setSuccessfulChecks(prev => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });
        }, 3000);
      }
    } catch (error) {
      console.error('❌ Type check failed:', filePath, error);

      setTextareaVisible(true);
      const errorMsg = `Type check failed for ${filePath}:\n${error}`;
      setTextareaContent(prev => {
        const separator = prev.trim() ? '\n\n---\n\n' : '';
        return prev + separator + errorMsg;
      });
    } finally {
      setCheckingFiles(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    }
  }, [currentPath, checkingFiles, setTextareaVisible, setTextareaContent]);

  const resetTypeChecker = useCallback(() => {
    setTypeCheckResults(new Map());
    setCheckingFiles(new Set());
    setSuccessfulChecks(new Set());
  }, []);

  return useMemo(() => ({
    checkFileTypes,
    formatTypeCheckErrors,
    checkingFiles,
    typeCheckResults,
    successfulChecks,
    resetTypeChecker,
  }), [checkFileTypes, formatTypeCheckErrors, checkingFiles, typeCheckResults, successfulChecks, resetTypeChecker]);
}
