import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WatcherProvider } from "./features/watcher";
import { BookmarksProvider } from "./features/bookmarks";
import { PromptTemplatesProvider } from "./features/templates";
import { FileGroupsProvider } from "./features/file-groups";
import { PinnedFilesProvider } from "./features/pinned-files";
import { AgentJobsProvider } from "./features/agent-jobs/AgentJobsContext";
import { TabProvider } from "./features/tabs";
import { PlansProvider } from "./features/plans/PlansContext";
import { ToastProvider } from "./features/toast";
import { ConfirmProvider } from "./features/confirm/ConfirmContext";
import { InstrumentKit } from "./dev/InstrumentKit";
import "./index.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { perfMark } from "./lib/perf";

// Imports are hoisted, so this marks the point where every module has been
// evaluated — the JS parse/eval cost sits before it.
perfMark("app:start");

// `?kit` (dev only) shows the Instrument TUI component sheet instead of the app.
const showKit = import.meta.env.DEV && new URLSearchParams(window.location.search).has("kit");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
        <ConfirmProvider>
        {showKit ? <InstrumentKit /> : (
        <WatcherProvider>
          <BookmarksProvider>
            <PromptTemplatesProvider>
              <FileGroupsProvider>
                <PinnedFilesProvider>
                  <AgentJobsProvider>
                    <TabProvider>
                      <PlansProvider>
                        <App />
                      </PlansProvider>
                    </TabProvider>
                  </AgentJobsProvider>
                </PinnedFilesProvider>
              </FileGroupsProvider>
            </PromptTemplatesProvider>
          </BookmarksProvider>
        </WatcherProvider>
        )}
        </ConfirmProvider>
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);

// Retire the boot splash (index.html) once the app's first frame is on screen,
// the fonts have loaded, and the mark has been visible long enough to read as
// intentional rather than a flicker. show() is a no-op if index.html already
// showed the window.
const SPLASH_MIN_VISIBLE_MS = 650;
const firstFrame = new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(resolve)),
);
firstFrame.then(() => getCurrentWindow().show().catch(() => {}));
Promise.all([firstFrame, document.fonts.ready, window.__splashReady ?? Promise.resolve(0)])
  .then(([, , revealedAt]) => {
    const wait = Math.max(0, revealedAt + SPLASH_MIN_VISIBLE_MS - performance.now());
    setTimeout(() => {
      const splash = document.getElementById("splash");
      if (!splash) return;
      splash.classList.add("is-done");
      setTimeout(() => splash.remove(), 300);
    }, wait);
  });
