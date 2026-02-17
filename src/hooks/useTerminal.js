import { useState, useEffect, useCallback, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

export function useTerminal(terminalRef, theme, imperativeRef, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled = false, networkIsolation = false, projectDir = null, initialCommand = null, secondaryMode = false) {
  const [terminal, setTerminal] = useState(null);
  const [fitAddon, setFitAddon] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [sandboxFailed, setSandboxFailed] = useState(false);
  const isFocusedRef = useRef(false);
  const sessionIdRef = useRef(null);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Typestar OCR", "Source Code Pro", Menlo, Monaco, "Courier New", monospace',
      theme: theme,
      allowProposedApi: true,
    });

    // Create addons
    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();

    // Load addons
    term.loadAddon(fit);
    term.loadAddon(webLinks);

    // Open terminal in DOM
    term.open(terminalRef.current);

    // Initial fit
    try {
      fit.fit();
    } catch (e) {
      // Container may not have dimensions yet, spawn effect will re-fit
    }

    setTerminal(term);
    setFitAddon(fit);

    return () => {
      term.dispose();
    };
  }, [terminalRef]);

  // Attach keyboard event handler (updates when callbacks change)
  useEffect(() => {
    if (!terminal) return;

    const disposable = terminal.attachCustomKeyEventHandler((event) => {
      // In secondary mode, pass all keys through to the terminal (nvim/lazygit need them)
      if (secondaryMode) {
        return true;
      }

      // Intercept Ctrl+F or Cmd+F
      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && event.type === 'keydown') {
        event.preventDefault();
        if (onSearchFocus) {
          onSearchFocus();
        }
        return false;
      }

      // Intercept Ctrl+G or Cmd+G
      if ((event.ctrlKey || event.metaKey) && event.key === 'g' && event.type === 'keydown') {
        event.preventDefault();
        if (onToggleGitFilter) {
          onToggleGitFilter();
        }
        return false;
      }

      return true;
    });

    return () => {
      if (disposable) {
        disposable.dispose();
      }
    };
  }, [terminal, onSearchFocus, onToggleGitFilter, secondaryMode]);

  // Spawn terminal process
  useEffect(() => {
    if (!terminal || !fitAddon) return;

    let unlisten;

    const initTerminal = async () => {
      try {
        // Get terminal dimensions
        const rows = terminal.rows;
        const cols = terminal.cols;

        // Spawn terminal backend
        const result = await invoke('spawn_terminal', { rows, cols, sandbox: sandboxEnabled, sandboxNoNet: networkIsolation, projectDir: projectDir || null });
        const id = result.session_id;
        sessionIdRef.current = id;
        setSessionId(id);

        // Check if sandbox was requested but failed
        if (sandboxEnabled && !result.sandboxed) {
          setSandboxFailed(true);
        }

        // Listen for terminal output
        unlisten = await listen('terminal-output', (event) => {
          if (event.payload.session_id === id) {
            terminal.write(event.payload.data);
          }
        });

        // Handle terminal input
        terminal.onData((data) => {
          invoke('write_to_terminal', { sessionId: id, data }).catch((error) => {
            console.error('Failed to write to terminal:', error);
          });
        });

        setIsReady(true);

        // Sync dimensions: fit may have changed cols/rows after initial spawn
        try {
          fitAddon.fit();
          const fittedRows = terminal.rows;
          const fittedCols = terminal.cols;
          if (fittedRows !== rows || fittedCols !== cols) {
            await invoke('resize_terminal', { sessionId: id, rows: fittedRows, cols: fittedCols });
          }
        } catch (e) {
          console.debug('Post-spawn fit skipped:', e.message);
        }

        // Send initial command if provided (for secondary terminal)
        if (initialCommand) {
          setTimeout(() => {
            invoke('write_to_terminal', { sessionId: id, data: initialCommand + '\n' }).catch((error) => {
              console.error('Failed to send initial command:', error);
            });
          }, 300);
        }
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
        terminal.write(`\r\n\x1b[1;31mError: ${error}\x1b[0m\r\n`);
      }
    };

    initTerminal();

    return () => {
      if (unlisten) {
        unlisten();
      }
      const id = sessionIdRef.current;
      if (id) {
        sessionIdRef.current = null;
        invoke('close_terminal', { sessionId: id }).catch((error) => {
          console.error('Failed to close terminal:', error);
        });
      }
    };
  }, [terminal, fitAddon]);

  // Handle resize
  const handleResize = useCallback(() => {
    if (fitAddon && terminal && sessionId) {
      try {
        // Check if terminal is ready for resize
        if (!terminal._core || !terminal._core._renderService) {
          return; // Terminal not fully initialized yet
        }
        fitAddon.fit();
        const rows = terminal.rows;
        const cols = terminal.cols;
        invoke('resize_terminal', { sessionId, rows, cols }).catch((error) => {
          console.error('Failed to resize terminal:', error);
        });
      } catch (error) {
        // Silently ignore resize errors during initialization
        console.debug('Resize skipped (terminal not ready):', error.message);
      }
    }
  }, [fitAddon, terminal, sessionId]);

  // Track focus state via the underlying textarea element
  useEffect(() => {
    if (!terminal?.textarea) return;

    const textarea = terminal.textarea;
    const handleFocus = () => {
      if (!isFocusedRef.current) {
        isFocusedRef.current = true;
        setIsFocused(true);
        onFocusChange?.(true);
      }
    };
    const handleBlur = () => {
      if (isFocusedRef.current) {
        isFocusedRef.current = false;
        setIsFocused(false);
        onFocusChange?.(false);
      }
    };

    textarea.addEventListener('focus', handleFocus);
    textarea.addEventListener('blur', handleBlur);

    return () => {
      textarea.removeEventListener('focus', handleFocus);
      textarea.removeEventListener('blur', handleBlur);
    };
  }, [terminal, onFocusChange]);

  // Update theme
  useEffect(() => {
    if (terminal && theme) {
      terminal.options.theme = theme;
    }
  }, [terminal, theme]);

  // Expose focus and blur methods to parent via ref
  useImperativeHandle(imperativeRef, () => ({
    focus: () => {
      if (terminal && isReady) {
        terminal.focus();
        return true;
      }
      console.warn('Terminal not ready for focus');
      return false;
    },
    blur: () => {
      if (terminal && isReady) {
        terminal.blur();
        return true;
      }
      return false;
    }
  }), [terminal, isReady]);

  return {
    terminal,
    sessionId,
    isReady,
    isFocused,
    sandboxFailed,
    handleResize,
  };
}
