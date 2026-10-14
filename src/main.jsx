import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WatcherProvider } from "./features/watcher";
import { BookmarksProvider } from "./features/bookmarks";
import { PromptTemplatesProvider } from "./features/templates";
import { FileGroupsProvider } from "./features/file-groups";
import { PinnedFilesProvider } from "./features/pinned-files";
import { AgentJobsProvider } from "./features/agent-jobs/agent-jobs";
import { TabProvider } from "./features/tabs";
import { ToastProvider } from "./features/toast";
import { InstrumentKit } from "./dev/InstrumentKit";
import "./index.css";

// `?kit` (dev only) shows the Instrument TUI component sheet instead of the app.
const showKit = import.meta.env.DEV && new URLSearchParams(window.location.search).has("kit");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
        {showKit ? <InstrumentKit /> : (
        <WatcherProvider>
          <BookmarksProvider>
            <PromptTemplatesProvider>
              <FileGroupsProvider>
                <PinnedFilesProvider>
                  <AgentJobsProvider>
                    <TabProvider>
                      <App />
                    </TabProvider>
                  </AgentJobsProvider>
                </PinnedFilesProvider>
              </FileGroupsProvider>
            </PromptTemplatesProvider>
          </BookmarksProvider>
        </WatcherProvider>
        )}
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);
