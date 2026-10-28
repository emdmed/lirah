import { useState, useEffect, useCallback, useMemo, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { invoke, Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getTerminalSession, rememberTerminalSession, forgetTerminalSession } from '../lib/terminalSessions';
import { useToast } from '../features/toast';
import { getScrollback, subscribeTerminalPrefs } from '../lib/terminalPrefs';
import { perfFirstOutput, perfInput, perfOutputWritten } from '../lib/perf';
import { markTerminalInput, markTerminalOutput } from '../features/tabs/terminalActivity';
import { isFocusMode } from '../lib/focusMode';
import '@xterm/xterm/css/xterm.css';

// Smallest geometry we will ever apply. FitAddon floors its proposal at 2 cols /
// 1 row whenever the container is collapsed — a window narrowed until the
// terminal column has no room left, a mid-resize frame, a shut panel. Applying
// that floor reflows the whole scrollback to 2 columns and SIGWINCHes the PTY
// with it; reflowing back out to the real width afterwards does not restore what
// the wrap destroyed, so the view stays garbled once the window is wide again.
// Ignoring the degenerate proposal keeps the last good geometry instead.
const MIN_USABLE_COLS = 20;
const MIN_USABLE_ROWS = 4;

// SIGWINCH pacing: quiet enough not to storm a TUI mid-drag, capped so a stream
// of resize events can never starve the final delivery.
const SIGWINCH_DEBOUNCE_MS = 120;
const SIGWINCH_MAX_WAIT_MS = 400;

// Output flow control. xterm parses asynchronously; past HIGH bytes written but
// not yet parsed, the backend stops draining the PTY so the kernel buffer
// throttles the child (`yes`, `cat bigfile`) instead of the JS thread.
const FLOW_HIGH_WATERMARK = 512 * 1024;
const FLOW_LOW_WATERMARK = 128 * 1024;

// WebGL budget. Browsers cap live contexts (~16) and evict the least recently
// used, so a terminal that has been out of sight this long gives its context
// back and rebuilds it when it is shown again.
const WEBGL_IDLE_DISPOSE_MS = 30_000;
// A restored renderer that survives this long resets the restore budget, so a
// few context losses spread over a long session don't strand us on the DOM
// renderer for good.
const WEBGL_RETRY_RESET_MS = 60_000;

// Every live WebGL renderer in this window. xterm shares one texture atlas
// between all terminals with the same font, theme and pixel ratio — the Claude
// terminal and a lazygit secondary included — but clearTextureAtlas() only
// resets the *calling* renderer's cell model. Every other terminal keeps its
// cached glyph coordinates into pages that are now being refilled with other
// glyphs, and paints the right colours in the wrong shapes until each of those
// cells changes. So a clear has to reach all of them (see requestRepaint).
const liveWebglRenderers = new Set();

function disposeWebgl(webgl) {
  liveWebglRenderers.delete(webgl);
  webgl.dispose();
}

// Window-wide repaint coalescing. One clear already reaches every renderer, so
// requests from any terminal in the same frame — a tab switch can raise the
// primary's and the secondary's intersection edges, a focus event and a WebGL
// rebuild together — share a single atlas clear, then each requester refreshes.
const repaintRequests = new Set(); // Terminal instances
let repaintRaf = 0;

function runRepaints() {
  repaintRaf = 0;
  const terms = [...repaintRequests];
  repaintRequests.clear();
  if (terms.length === 0) return;
  for (const webgl of liveWebglRenderers) {
    try {
      webgl.clearTextureAtlas();
    } catch (e) {
      console.debug('Texture atlas clear skipped:', e?.message);
    }
  }
  for (const term of terms) {
    try {
      term.refresh(0, term.rows - 1);
    } catch (e) {
      // Renderer may not be ready (or the terminal was disposed); ignore.
    }
  }
}

function requestRepaint(term) {
  if (!term) return;
  repaintRequests.add(term);
  if (!repaintRaf) repaintRaf = requestAnimationFrame(runRepaints);
}

function cancelRepaint(term) {
  repaintRequests.delete(term);
  if (repaintRequests.size === 0 && repaintRaf) {
    cancelAnimationFrame(repaintRaf);
    repaintRaf = 0;
  }
}

export function useTerminal(terminalRef, theme, imperativeRef, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled = false, networkIsolation = false, projectDir = null, initialCommand = null, secondaryMode = false, isActive = true, reattachKey = null, onExit = null) {
  const [terminal, setTerminal] = useState(null);
  const [fitAddon, setFitAddon] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  // The shell was reclaimed after a webview reload rather than spawned.
  const [reattached, setReattached] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [sandboxFailed, setSandboxFailed] = useState(false);
  const [searchAddon, setSearchAddon] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const isFocusedRef = useRef(false);
  const sessionIdRef = useRef(null);
  const lastDimsRef = useRef({ rows: 0, cols: 0 });
  const pendingDimsRef = useRef(null);
  const sigwinchTimerRef = useRef(null);
  const pendingSinceRef = useRef(0);
  const onDataDisposableRef = useRef(null);
  const terminalInstRef = useRef(null);
  // WebGL renderer state. A lost context drops us to the DOM renderer, which is
  // far slower under heavy output, so track it and rebuild when we can.
  const webglRef = useRef(null);
  const [rendererLost, setRendererLost] = useState(false);
  const rendererRetriesRef = useRef(0);
  const rendererRetryResetRef = useRef(0);
  // Disposed for the WebGL budget (as opposed to lost): rebuild on activation.
  const webglSuspendedRef = useRef(false);
  // A resize arrived while hidden; refit when shown again.
  const resizeDirtyRef = useRef(false);
  // fit() changed rows/cols since the last SIGWINCH flush, i.e. the canvas was
  // reallocated and the flush owes a repaint (see flushSigwinch).
  const geometryChangedRef = useRef(false);
  // Last state seen by the IntersectionObserver; null until its first callback.
  const visibleRef = useRef(null);
  const isActiveRef = useRef(isActive);
  const { error } = useToast();

  // Load a fresh WebGL renderer. Must be called after open(). If the context
  // can't be created (headless, driver issues) we stay on the DOM renderer.
  const attachWebgl = useCallback((term) => {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        // Only the live renderer's loss matters; one we disposed ourselves is
        // already gone.
        if (webglRef.current !== webgl) return;
        webglRef.current = null;
        disposeWebgl(webgl);
        setRendererLost(true);
      });
      term.loadAddon(webgl);
      liveWebglRenderers.add(webgl);
      webglRef.current = webgl;
      return webgl;
    } catch (e) {
      webglRef.current = null;
      console.debug('WebGL renderer unavailable, using DOM renderer:', e?.message);
      return null;
    }
  }, []);

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
    // Browsers cap live WebGL contexts and evict the least recently used one
    // first — with several tabs, each holding a primary and maybe a secondary
    // terminal, a background tab's context is exactly what gets taken. A loss
    // is recorded and the renderer rebuilt when the tab is active again, and
    // background terminals hand their context back (see the budget below).
    attachWebgl(term);

    // Initial fit. The window starts hidden (boot splash), and on Linux the
    // hidden webview has no layout box yet, so fit() would hit the 2x1 floor
    // and the shell would spawn at 2 columns. Keep xterm's 80x24 default until
    // there is room; the ResizeObserver fits once the window is shown.
    try {
      const proposed = fit.proposeDimensions();
      if (proposed && proposed.cols >= MIN_USABLE_COLS && proposed.rows >= MIN_USABLE_ROWS) {
        fit.fit();
      }
    } catch (e) {
      // Container may not have dimensions yet, spawn effect will re-fit
    }

    terminalInstRef.current = term;
    setTerminal(term);
    setFitAddon(fit);
    setSearchAddon(search);

    return () => {
      const webgl = webglRef.current;
      webglRef.current = null;
      if (webgl) disposeWebgl(webgl);
      terminalInstRef.current = null;
      term.dispose();
    };
  }, [terminalRef, attachWebgl]);

  // Attach keyboard event handler (updates when callbacks change)
  useEffect(() => {
    if (!terminal) return;

    const disposable = terminal.attachCustomKeyEventHandler((event) => {
      // Scrollback search. Ctrl+F is already the file-tree search, so this takes
      // Ctrl+Shift+F — and it comes before the secondary-mode passthrough so the
      // secondary terminal gets search too. Not in focus mode: nvim and lazygit
      // get every key.
      if (secondaryMode && isFocusMode()) {
        return true;
      }
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

    let cancelled = false;
    let id = null;

    // Raw PTY bytes for this session only, in order — including whatever the
    // shell prints before spawn_terminal resolves. xterm decodes the UTF-8
    // itself, so sequences split across chunks need no special care.
    const output = new Channel();
    let pendingBytes = 0;
    let paused = false;
    output.onmessage = (buf) => {
      if (cancelled) return;
      const bytes = new Uint8Array(buf);
      markTerminalOutput(id);
      pendingBytes += bytes.length;
      terminal.write(bytes, () => {
        perfFirstOutput();
        perfOutputWritten();
        pendingBytes -= bytes.length;
        if (paused && pendingBytes < FLOW_LOW_WATERMARK && !cancelled) {
          paused = false;
          invoke('pty_resume', { sessionId: id }).catch(() => {});
        }
      });
      if (!paused && id && pendingBytes > FLOW_HIGH_WATERMARK) {
        paused = true;
        invoke('pty_pause', { sessionId: id }).catch(() => {});
      }
    };

    const initTerminal = async () => {
      try {
        // Get terminal dimensions
        const rows = terminal.rows;
        const cols = terminal.cols;

        // After a webview reload the shell is still running: claim it back
        // (its recent output is replayed on `output`) instead of spawning.
        const storedId = reattachKey ? getTerminalSession(reattachKey) : null;
        let result = storedId
          ? await invoke('attach_terminal', { sessionId: storedId, output }).catch(() => null)
          : null;
        const reattached = !!result;
        if (!result) {
          result = await invoke('spawn_terminal', { rows, cols, sandbox: sandboxEnabled, sandboxNoNet: networkIsolation, projectDir: projectDir || null, output });
        }
        id = result.session_id;
        if (cancelled) {
          // Unmounted while spawning: the cleanup had no id to close yet. A
          // reattached session is left alone — under StrictMode the remount
          // claims it again.
          if (!reattached) invoke('close_terminal', { sessionId: id }).catch(() => {});
          return;
        }
        if (reattachKey) rememberTerminalSession(reattachKey, id);
        sessionIdRef.current = id;
        setReattached(reattached);
        setSessionId(id);

        // Sandbox was requested but didn't come up. The owner (ProjectTab, via
        // Terminal's onSandboxFailed) shows the warning with a working
        // "Retry without sandbox" action, since only it can restart the shell.
        if (sandboxEnabled && !result.sandboxed) {
          setSandboxFailed(true);
        }

        // Handle terminal input. Held so the cleanup below can dispose it — an
        // undisposed handler would double every keystroke if this effect re-ran.
        const dataDisposable = terminal.onData((data) => {
          perfInput();
          markTerminalInput(id);
          invoke('write_to_terminal', { sessionId: id, data }).catch((error) => {
            console.error('Failed to write to terminal:', error);
          });
        });
        if (cancelled) dataDisposable.dispose();
        else onDataDisposableRef.current = dataDisposable;

        setIsReady(true);

        // Sync dimensions: fit may have changed cols/rows after initial spawn
        try {
          const proposed = fitAddon.proposeDimensions();
          if (proposed && proposed.cols >= MIN_USABLE_COLS && proposed.rows >= MIN_USABLE_ROWS) {
            fitAddon.fit();
          }
          const fittedRows = terminal.rows;
          const fittedCols = terminal.cols;
          if (fittedRows !== rows || fittedCols !== cols) {
            await invoke('resize_terminal', { sessionId: id, rows: fittedRows, cols: fittedCols });
          }
        } catch (e) {
          console.debug('Post-spawn fit skipped:', e.message);
        }

        // Send initial command if provided (for secondary terminal)
        if (initialCommand && !reattached) {
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
      output.onmessage = () => {};
      onDataDisposableRef.current?.dispose();
      onDataDisposableRef.current = null;
      const id = sessionIdRef.current;
      if (id) {
        sessionIdRef.current = null;
        if (reattachKey) forgetTerminalSession(reattachKey, id);
        invoke('close_terminal', { sessionId: id }).catch((error) => {
          console.error('Failed to close terminal:', error);
        });
      }
    };
  }, [terminal, fitAddon]);

  // The shell exited on its own (e.g. `exec nvim` and the user quit nvim).
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);
  useEffect(() => {
    if (!sessionId) return;
    let unlisten = null;
    let disposed = false;
    listen('terminal-exited', (event) => {
      if (event.payload?.session_id === sessionId) onExitRef.current?.();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [sessionId]);

  // Rebuild the GPU glyph atlas and repaint every cell, on the next frame.
  // refresh() alone re-runs the renderer against the *existing* atlas, so glyphs
  // smeared when the canvas was reallocated during a resize (WebKitGTK does this
  // on window maximize) get painted right back. Clearing the atlas first forces
  // them to be re-rasterized. The atlas is shared, so every other live renderer
  // is told too. Every caller goes through here: they can all fire for the same
  // event, and each clear costs a full re-rasterization (see requestRepaint).
  const scheduleRepaint = useCallback(() => {
    requestRepaint(terminalInstRef.current);
  }, []);

  // For repaints a resize or renderer rebuild owes while the terminal may still
  // be off screen: there xterm is paused and would swallow the refresh, and the
  // hidden -> visible edge below repaints anyway once it has resumed — so
  // defer to that rather than paying for two atlas clears on one tab switch.
  const repaintUnlessHidden = useCallback(() => {
    if (visibleRef.current !== false) scheduleRepaint();
  }, [scheduleRepaint]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!terminal) return;
    return () => cancelRepaint(terminal);
  }, [terminal]);

  // Repaint when this terminal comes back on screen. Background tabs are moved
  // out of the viewport (see ProjectTab), which is what engages xterm's own
  // render pause — but while paused xterm turns refresh() into a deferred
  // _needsFullRefresh flag and queues renderer resizes into a paused task, so a
  // repaint driven off a rAF after the tab flips races the resume and lands on
  // whichever side of it the browser feels like. Observing the same element
  // xterm does removes the race: IntersectionObserver callbacks are delivered
  // in registration order, and xterm registers its observer during open(), so
  // by the time this runs the renderer has already un-paused and we are
  // clearing an atlas that will actually be re-uploaded.
  useEffect(() => {
    if (!terminal || typeof IntersectionObserver === 'undefined') return;
    const el = terminal.element?.querySelector('.xterm-screen') || terminal.element;
    if (!el) return;
    let wasVisible = null;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const visible = entry.isIntersecting === undefined
          ? entry.intersectionRatio > 0
          : entry.isIntersecting;
        // Only on the hidden -> visible edge; the first callback just records
        // the starting state, since a terminal that was never hidden has
        // nothing stale to repaint.
        if (wasVisible === false && visible) scheduleRepaint();
        wasVisible = visible;
        visibleRef.current = visible;
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      visibleRef.current = null;
    };
  }, [terminal, scheduleRepaint]);

  // Repaint when the window itself comes back. Alt-tabbing away lets the
  // compositor occlude us and the browser evict our GL context; nothing about
  // that changes the tab's visibility or geometry, so no resize, no
  // intersection change, and without this nothing would ever repaint the stale
  // canvas. Only the visible tab needs it — the others repaint on their own
  // intersection edge when the user switches to them.
  useEffect(() => {
    if (!terminal) return;
    const onWake = () => {
      if (!isActiveRef.current) return;
      if (document.visibilityState === 'hidden') return;
      scheduleRepaint();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [terminal, scheduleRepaint]);

  // Flush a pending PTY resize immediately. TUI apps like Claude Code (Ink)
  // re-paint with absolute cursor positioning on SIGWINCH, so we must avoid
  // SIGWINCH storms during a sidebar drag while still delivering the final
  // size promptly when the user lets go.
  const flushSigwinch = useCallback(() => {
    if (sigwinchTimerRef.current) {
      clearTimeout(sigwinchTimerRef.current);
      sigwinchTimerRef.current = null;
    }
    pendingSinceRef.current = 0;
    // The resize gesture has settled — this is the point where a stale atlas is
    // worth the cost of rebuilding, once, rather than on every intermediate fit.
    // Only if the geometry actually moved, though: a tab activation re-fits at
    // the same size, and no canvas reallocation means nothing smeared.
    if (geometryChangedRef.current) {
      geometryChangedRef.current = false;
      repaintUnlessHidden();
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
  }, [repaintUnlessHidden]);

  // Handle resize — refits the xterm canvas to its container synchronously
  // (cheap, local) and queues a debounced SIGWINCH to the backend PTY. The
  // refresh() call evicts stale pixels from the canvas/WebGL renderer that
  // would otherwise overlay the next paint from a TUI app.
  const handleResize = useCallback(({ immediate = false } = {}) => {
    if (!fitAddon || !terminal || !sessionId) return;
    // A hidden terminal skips the refit and the SIGWINCH — a background TUI
    // would redraw for nobody. It catches up when shown (see below); an
    // explicit immediate resize (tab activation) always goes through.
    if (!immediate && !isActiveRef.current) {
      resizeDirtyRef.current = true;
      return;
    }
    resizeDirtyRef.current = false;
    try {
      if (!terminal._core || !terminal._core._renderService) {
        return;
      }
      // Check what fit() *would* do before letting it touch the buffer: a
      // collapsed container yields the 2x1 floor, which is destructive (see
      // MIN_USABLE_COLS). Keep the current geometry until there is room again.
      const proposed = fitAddon.proposeDimensions();
      if (!proposed || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)) {
        return;
      }
      if (proposed.cols < MIN_USABLE_COLS || proposed.rows < MIN_USABLE_ROWS) {
        return;
      }
      const prevRows = terminal.rows;
      const prevCols = terminal.cols;
      fitAddon.fit();
      const rows = terminal.rows;
      const cols = terminal.cols;
      // The refresh evicts pixels the canvas reallocation left behind; when fit()
      // was a no-op there was no reallocation and nothing to evict.
      if (rows !== prevRows || cols !== prevCols) {
        geometryChangedRef.current = true;
        try {
          terminal.refresh(0, rows - 1);
        } catch (e) {
          // Renderer may not be ready; ignore.
        }
      }
      pendingDimsRef.current = { rows, cols };
      if (immediate) {
        flushSigwinch();
        return;
      }
      // Debounce, but with a ceiling: every event pushes the timer out, so a
      // window manager that streams resize events (a maximize animation, a
      // compositor doing continuous resize) could postpone the SIGWINCH
      // indefinitely and leave the TUI painting at a size nobody has anymore.
      const now = performance.now();
      if (!pendingSinceRef.current) pendingSinceRef.current = now;
      if (now - pendingSinceRef.current >= SIGWINCH_MAX_WAIT_MS) {
        flushSigwinch();
        return;
      }
      if (sigwinchTimerRef.current) clearTimeout(sigwinchTimerRef.current);
      sigwinchTimerRef.current = setTimeout(flushSigwinch, SIGWINCH_DEBOUNCE_MS);
    } catch (error) {
      console.debug('Resize skipped (terminal not ready):', error.message);
    }
  }, [fitAddon, terminal, sessionId, flushSigwinch]);

  // Catch up on resizes skipped while hidden. ProjectTab also forces a resize of
  // the primary terminal on activation; this covers the secondary one too.
  useEffect(() => {
    if (!isActive || !resizeDirtyRef.current) return;
    const raf = requestAnimationFrame(() => {
      if (resizeDirtyRef.current) handleResize({ immediate: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, handleResize]);

  // Cleanup pending SIGWINCH timer on unmount
  useEffect(() => {
    return () => {
      if (sigwinchTimerRef.current) {
        clearTimeout(sigwinchTimerRef.current);
        sigwinchTimerRef.current = null;
      }
      pendingSinceRef.current = 0;
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

  // Rebuild the GPU renderer once the terminal is on screen again. Retrying
  // while hidden would just lose the context to the next foreground terminal, and
  // a few failures in a row means this machine can't hold another context — stay
  // on the DOM renderer rather than thrashing.
  useEffect(() => {
    if (!terminal || !rendererLost || !isActive) return;
    if (rendererRetriesRef.current >= 3) return;
    rendererRetriesRef.current += 1;
    const webgl = attachWebgl(terminal);
    if (!webgl) return;
    setRendererLost(false);
    // The atlas is cached per terminal by the addon and survives the addon
    // that built it, so a fresh renderer can come back pointing at pages that
    // were uploaded to the context we just lost — which paints the right
    // glyph shapes from the wrong slots. Force a re-rasterization.
    repaintUnlessHidden();
    clearTimeout(rendererRetryResetRef.current);
    rendererRetryResetRef.current = setTimeout(() => {
      if (webglRef.current === webgl) rendererRetriesRef.current = 0;
    }, WEBGL_RETRY_RESET_MS);
  }, [terminal, rendererLost, isActive, attachWebgl, repaintUnlessHidden]);

  useEffect(() => () => clearTimeout(rendererRetryResetRef.current), []);

  // WebGL budget: give the context back after a while out of sight, and
  // rebuild it when the terminal is shown again. Hidden terminals don't render
  // (xterm pauses off-screen), so the DOM renderer costs them nothing meanwhile.
  useEffect(() => {
    if (!terminal) return;
    if (isActive) {
      if (webglSuspendedRef.current) {
        webglSuspendedRef.current = false;
        if (!webglRef.current && attachWebgl(terminal)) repaintUnlessHidden();
      }
      return;
    }
    const timer = setTimeout(() => {
      const webgl = webglRef.current;
      if (!webgl) return;
      webglRef.current = null;
      webglSuspendedRef.current = true;
      disposeWebgl(webgl);
    }, WEBGL_IDLE_DISPOSE_MS);
    return () => clearTimeout(timer);
  }, [terminal, isActive, attachWebgl, repaintUnlessHidden]);

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
    },
    // Whether the program in the terminal asked for bracketed paste (DECSET 2004).
    bracketedPaste: () => !!terminal?.modes?.bracketedPasteMode,
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
    reattached,
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
