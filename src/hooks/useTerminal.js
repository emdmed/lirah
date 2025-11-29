import { useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

export function useTerminal(terminalRef, theme, imperativeRef, onSearchFocus, onToggleGitFilter) {
  const [terminal, setTerminal] = useState(null);
  const [fitAddon, setFitAddon] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Source Code Pro", Menlo, Monaco, "Courier New", monospace',
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

    // Fit terminal to container
    fit.fit();

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
  }, [terminal, onSearchFocus, onToggleGitFilter]);

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
        const id = await invoke('spawn_terminal', { rows, cols });
        setSessionId(id);

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
      if (sessionId) {
        invoke('close_terminal', { sessionId }).catch((error) => {
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

  // Update theme
  useEffect(() => {
    if (terminal && theme) {
      terminal.options.theme = theme;
    }
  }, [terminal, theme]);

  // Expose focus method to parent via ref
  useImperativeHandle(imperativeRef, () => ({
    focus: () => {
      if (terminal && isReady) {
        terminal.focus();
        return true;
      }
      console.warn('Terminal not ready for focus');
      return false;
    }
  }), [terminal, isReady]);

  return {
    terminal,
    sessionId,
    isReady,
    handleResize,
  };
}
