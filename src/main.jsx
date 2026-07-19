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
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
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
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);
