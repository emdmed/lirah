import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WatcherProvider } from "./features/watcher";
import { BookmarksProvider } from "./features/bookmarks";
import { PromptTemplatesProvider } from "./features/templates";
import { FileGroupsProvider } from "./features/file-groups";
import { FileSelectionProvider } from "./features/file-groups";
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
                <FileSelectionProvider>
                  <App />
                </FileSelectionProvider>
              </FileGroupsProvider>
            </PromptTemplatesProvider>
          </BookmarksProvider>
        </WatcherProvider>
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);
