import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WatcherProvider } from "./contexts/WatcherContext";
import { BookmarksProvider } from "./contexts/BookmarksContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <WatcherProvider>
        <BookmarksProvider>
          <App />
        </BookmarksProvider>
      </WatcherProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
