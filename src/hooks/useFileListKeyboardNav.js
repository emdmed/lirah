import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for managing keyboard navigation within the file list
 * Handles arrow keys, delete, tab, escape, home, end, and number keys
 *
 * @param {Object} options
 * @param {number} options.filesCount - Number of files in the list
 * @param {Function} options.onRemoveFile - Callback to remove file at index: (index) => void
 * @param {Function} options.onFocusTextarea - Callback to focus the textarea
 * @param {Function} options.onSetFileState - Callback to set file state: (index, state) => void
 * @returns {Object} { selectedIndex, setSelectedIndex, handleKeyDown, fileRefs }
 */
export function useFileListKeyboardNav({
  filesCount,
  onRemoveFile,
  onFocusTextarea,
  onSetFileState
}) {
  // Currently selected file index (null = no selection)
  const [selectedIndex, setSelectedIndex] = useState(null);

  // Refs to file items for programmatic focus
  const fileRefs = useRef([]);

  // File states for number key shortcuts
  const FILE_STATES = ['modify', 'do-not-modify', 'use-as-example'];

  // Reset selection if files list becomes empty
  useEffect(() => {
    if (filesCount === 0) {
      setSelectedIndex(null);
    } else if (selectedIndex !== null && selectedIndex >= filesCount) {
      // Adjust selection if it's out of bounds
      setSelectedIndex(filesCount - 1);
    }
  }, [filesCount, selectedIndex]);

  /**
   * Master keyboard event handler for file list navigation
   */
  const handleKeyDown = useCallback((e) => {
    // No files, no navigation
    if (filesCount === 0) return;

    let handled = false;
    let newIndex = selectedIndex;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        handled = true;
        if (selectedIndex === null) {
          newIndex = 0;
        } else {
          newIndex = (selectedIndex + 1) % filesCount;
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        handled = true;
        if (selectedIndex === null) {
          newIndex = filesCount - 1;
        } else {
          newIndex = (selectedIndex - 1 + filesCount) % filesCount;
        }
        break;

      case 'Home':
        e.preventDefault();
        handled = true;
        newIndex = 0;
        break;

      case 'End':
        e.preventDefault();
        handled = true;
        newIndex = filesCount - 1;
        break;

      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        handled = true;
        if (selectedIndex !== null) {
          onRemoveFile(selectedIndex);

          // After removal, focus next file or previous if was last
          // Note: filesCount will be decremented after this callback
          if (filesCount > 1) {
            // If we removed the last item, go to previous
            if (selectedIndex >= filesCount - 1) {
              setSelectedIndex(Math.max(0, selectedIndex - 1));
            }
            // Otherwise stay at same index (which will be the next item)
          } else {
            // Last file removed, focus textarea
            setSelectedIndex(null);
            onFocusTextarea();
          }
        }
        return; // Early return to avoid setting index below

      case 'Tab':
        if (!e.shiftKey) {
          e.preventDefault();
          handled = true;
          onFocusTextarea();
          return; // Early return
        }
        break;

      case 'Escape':
        e.preventDefault();
        handled = true;
        setSelectedIndex(null);
        onFocusTextarea();
        return; // Early return

      case '1':
      case '2':
      case '3':
        if (selectedIndex !== null) {
          e.preventDefault();
          handled = true;
          const stateIndex = parseInt(e.key) - 1;
          onSetFileState(selectedIndex, FILE_STATES[stateIndex]);
        }
        break;

      default:
        // Not handled
        break;
    }

    // Update selected index if it changed
    if (handled && newIndex !== selectedIndex) {
      setSelectedIndex(newIndex);
    }
  }, [filesCount, selectedIndex, onRemoveFile, onFocusTextarea, onSetFileState]);

  return {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    fileRefs
  };
}
