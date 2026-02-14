import { useState, useEffect } from "react";

function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch { return defaultValue; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to save ${key} to localStorage:`, error);
    }
  }, [key, value]);

  return [value, setValue];
}

export function useTerminalSettings() {
  const [sandboxEnabled, setSandboxEnabled] = useLocalStorageState('nevo-terminal:sandbox-enabled', false);
  const [sandboxFailed, setSandboxFailed] = useState(false);
  const [networkIsolation, setNetworkIsolation] = useLocalStorageState('nevo-terminal:network-isolation', false);
  const [showTitleBar, setShowTitleBar] = useLocalStorageState('nevo-terminal:show-title-bar', true);
  const [keepFilesAfterSend, setKeepFilesAfterSend] = useLocalStorageState('nevo-terminal:keep-files-after-send', false);

  const [selectedCli, setSelectedCli] = useState(() => {
    try {
      return localStorage.getItem('nevo-terminal:selected-cli') || 'claude-code';
    } catch { return 'claude-code'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('nevo-terminal:selected-cli', selectedCli);
    } catch (error) {
      console.warn('Failed to save CLI preference to localStorage:', error);
    }
  }, [selectedCli]);

  return {
    sandboxEnabled, setSandboxEnabled,
    sandboxFailed, setSandboxFailed,
    networkIsolation, setNetworkIsolation,
    showTitleBar, setShowTitleBar,
    keepFilesAfterSend, setKeepFilesAfterSend,
    selectedCli, setSelectedCli,
  };
}
