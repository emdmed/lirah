import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WatcherProvider } from "./contexts/WatcherContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <WatcherProvider>
        <App />
      </WatcherProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
