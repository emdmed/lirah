import { useState, useEffect, useCallback, useMemo, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '../features/toast';
import { getScrollback, subscribeTerminalPrefs } from '../lib/terminalPrefs';
import '@xterm/xterm/css/xterm.css';

export function useTerminal(terminalRef, theme, imperativeRef, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled = false, networkIsolation = false, projectDir = null, initialCommand = null, secondaryMode = false) {
  const [terminal, setTerminal] = useState(null);
  const [fitAddon, setFitAddon] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [sandboxFailed, setSandboxFailed] = useState(false);
  const [searchAddon, setSearchAddon] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const isFocusedRef = useRef(false);
  const sessionIdRef = useRef(null);
  const lastDimsRef = useRef({ rows: 0, cols: 0 });
  const pendingDimsRef = useRef(null);
  const sigwinchTimerRef = useRef(null);
  const onDataDisposableRef = useRef(null);
  const { error, warning } = useToast();

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
      // User-configurable; xterm's 1000-line default loses most of an agent turn.
      scrollback: getScrollback(),
    });

    // Create addons
    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();
    const search = new SearchAddon();

    // Load addons
    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.loadAddon(search);

    // Unicode 11 widths. Without it xterm uses the v6 table, which is one column
    // short on most emoji — enough to smear the redraws of TUI agents (Ink) that
    // position the cursor absolutely.
    try {
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = '11';
    } catch (e) {
      console.debug('Unicode 11 addon unavailable:', e?.message);
    }

    // Open terminal in DOM
    term.open(terminalRef.current);

    // GPU-accelerated rendering. The default DOM renderer builds a node per
    // styled cell and thrashes layout/paint on heavy TUI output (Claude Code
    // redraws, build logs, `cat` of large files). WebGL offloads glyph
    // rendering to the GPU — an order-of-magnitude win under bursty output.
    // Must be loaded after open(). If the context can't be created (headless,
    // driver issues) or is lost, dispose and fall back to the DOM renderer.
    let webgl = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl?.dispose();
        webgl = null;
      });
      term.loadAddon(webgl);
    } catch (e) {
      webgl?.dispose();
      webgl = null;
      console.debug('WebGL renderer unavailable, using DOM renderer:', e?.message);
    }

    // Initial fit
    try {
      fit.fit();
    } catch (e) {
      // Container may not have dimensions yet, spawn effect will re-fit
    }

    setTerminal(term);
    setFitAddon(fit);
    setSearchAddon(search);

    return () => {
      webgl?.dispose();
      term.dispose();
    };
  }, [terminalRef]);

  // Attach keyboard event handler (updates when callbacks change)
  useEffect(() => {
    if (!terminal) return;

    const disposable = terminal.attachCustomKeyEventHandler((event) => {
      // Scrollback search. Ctrl+F is already the file-tree search, so this takes
      // Ctrl+Shift+F — and it comes before the secondary-mode passthrough so the
      // secondary terminal gets search too.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f' && event.type === 'keydown') {
        event.preventDefault();
        setSearchOpen(true);
        return false;
      }

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
    let cancelled = false;

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
          warning('Sandbox failed to initialize. Terminal running without sandbox.', {
            duration: 8000,
            action: {
              label: 'Retry without sandbox',
              onClick: () => {
                // User can toggle sandbox off and restart
                console.log('User acknowledged sandbox failure');
              }
            }
          });
        }

        // Listen for terminal output on this session's own event channel. The
        // backend scopes the event name per session (terminal-output-<id>), so
        // this listener only ever receives its own stream — no cross-terminal
        // fan-out or filtering needed even with many tabs mounted at once.
        const fn = await listen(`terminal-output-${id}`, (event) => {
          terminal.write(event.payload.data);
        });
        // Unmounted while listen() was resolving — tear down immediately
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }

        // Handle terminal input. Held so the cleanup below can dispose it — an
        // undisposed handler would double every keystroke if this effect re-ran.
        const dataDisposable = terminal.onData((data) => {
          invoke('write_to_terminal', { sessionId: id, data }).catch((error) => {
            console.error('Failed to write to terminal:', error);
          });
        });
        if (cancelled) dataDisposable.dispose();
        else onDataDisposableRef.current = dataDisposable;

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
      } catch (err) {
        console.error('Failed to initialize terminal:', err);
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        terminal.write(`\r\n\x1b[1;31mError: ${errorMessage}\x1b[0m\r\n`);
        error(`Failed to initialize terminal: ${errorMessage}`, {
          duration: 10000,
          action: {
            label: 'Retry',
            onClick: () => {
              // Trigger a re-mount by updating the terminal key in parent
              console.log('Retry requested - parent component should handle remount');
            }
          }
        });
      }
    };

    initTerminal();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
      onDataDisposableRef.current?.dispose();
      onDataDisposableRef.current = null;
      const id = sessionIdRef.current;
      if (id) {
        sessionIdRef.current = null;
        invoke('close_terminal', { sessionId: id }).catch((error) => {
          console.error('Failed to close terminal:', error);
        });
      }
    };
  }, [terminal, fitAddon]);

  // Flush a pending PTY resize immediately. TUI apps like Claude Code (Ink)
  // re-paint with absolute cursor positioning on SIGWINCH, so we must avoid
  // SIGWINCH storms during a sidebar drag while still delivering the final
  // size promptly when the user lets go.
  const flushSigwinch = useCallback(() => {
    if (sigwinchTimerRef.current) {
      clearTimeout(sigwinchTimerRef.current);
      sigwinchTimerRef.current = null;
    }
    const pending = pendingDimsRef.current;
    const id = sessionIdRef.current;
    if (!pending || !id) return;
    pendingDimsRef.current = null;
    if (pending.rows === lastDimsRef.current.rows && pending.cols === lastDimsRef.current.cols) {
      return;
    }
    lastDimsRef.current = pending;
    invoke('resize_terminal', { sessionId: id, rows: pending.rows, cols: pending.cols }).catch((err) => {
      console.error('Failed to resize terminal:', err);
    });
  }, []);

  // Handle resize — refits the xterm canvas to its container synchronously
  // (cheap, local) and queues a debounced SIGWINCH to the backend PTY. The
  // refresh() call evicts stale pixels from the canvas/WebGL renderer that
  // would otherwise overlay the next paint from a TUI app.
  const handleResize = useCallback(({ immediate = false } = {}) => {
    if (!fitAddon || !terminal || !sessionId) return;
    try {
      if (!terminal._core || !terminal._core._renderService) {
        return;
      }
      fitAddon.fit();
      const rows = terminal.rows;
      const cols = terminal.cols;
      try {
        terminal.refresh(0, terminal.rows - 1);
      } catch (e) {
        // Renderer may not be ready; ignore.
      }
      pendingDimsRef.current = { rows, cols };
      if (immediate) {
        flushSigwinch();
        return;
      }
      if (sigwinchTimerRef.current) clearTimeout(sigwinchTimerRef.current);
      sigwinchTimerRef.current = setTimeout(flushSigwinch, 120);
    } catch (error) {
      console.debug('Resize skipped (terminal not ready):', error.message);
    }
  }, [fitAddon, terminal, sessionId, flushSigwinch]);

  // Cleanup pending SIGWINCH timer on unmount
  useEffect(() => {
    return () => {
      if (sigwinchTimerRef.current) {
        clearTimeout(sigwinchTimerRef.current);
        sigwinchTimerRef.current = null;
      }
    };
  }, []);

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

  // Apply preference changes to this already-open terminal, including ones made
  // in another window of the app.
  useEffect(() => {
    if (!terminal) return;
    return subscribeTerminalPrefs(() => {
      terminal.options.scrollback = getScrollback();
    });
  }, [terminal]);

  // Update theme
  useEffect(() => {
    if (terminal && theme) {
      terminal.options.theme = theme;
    }
  }, [terminal, theme]);

  // Expose focus, blur, and resize methods to parent via ref
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
    },
    resize: () => {
      // Force-flush SIGWINCH on tab activation: the app may have missed
      // resize events while hidden, and Ink-style renderers rely on the
      // latest size to redraw cleanly.
      handleResize({ immediate: true });
    }
  }), [terminal, isReady, handleResize]);

  // The search addon only reports match counts when decorations are enabled, and
  // decoration colors aren't themed for us — derive them from the terminal theme
  // so highlights stay legible on light and dark alike.
  const searchDecorations = useMemo(
    () => ({
      matchBackground: theme?.selectionBackground || '#585b70',
      matchOverviewRuler: theme?.yellow || '#f9e2af',
      activeMatchBackground: theme?.yellow || '#f9e2af',
      activeMatchColorOverviewRuler: theme?.red || '#f38ba8',
    }),
    [theme]
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchAddon?.clearDecorations?.();
    terminal?.focus();
  }, [searchAddon, terminal]);

  return {
    terminal,
    sessionId,
    isReady,
    isFocused,
    sandboxFailed,
    handleResize,
    searchAddon,
    searchOpen,
    searchDecorations,
    closeSearch,
  };
}
