import { useState, useMemo } from "react";
import { useSetting, useSeededSetting } from "../features/settings/settingsStore";

// Preferences live in the shared settings store (src/features/settings), so a
// change in one tab shows up in every open tab at once.
//
// Sandbox, network isolation and the CLI are seeded instead: they are applied
// when the tab's terminal spawns, so each tab keeps its own live value (the
// last one set becomes the default for new tabs). Sharing them would make
// other tabs report a sandbox or CLI their running process doesn't have.
export function useTerminalSettings() {
  const [sandboxEnabled, setSandboxEnabled] = useSeededSetting('sandboxEnabled');
  const [sandboxFailed, setSandboxFailed] = useState(false);
  const [networkIsolation, setNetworkIsolation] = useSeededSetting('networkIsolation');
  const [selectedCli, setSelectedCli] = useSeededSetting('selectedCli');
  const [showTitleBar, setShowTitleBar] = useSetting('showTitleBar');
  const [keepFilesAfterSend, setKeepFilesAfterSend] = useSetting('keepFilesAfterSend');
  const [autoLaunchCli, setAutoLaunchCli] = useSetting('autoLaunchCli');
  const [autoChangelogEnabled, setAutoChangelogEnabled] = useSetting('autoChangelogEnabled');
  const [autoChangelogTarget, setAutoChangelogTarget] = useSetting('autoChangelogTarget');
  const [autoChangelogTrigger, setAutoChangelogTrigger] = useSetting('autoChangelogTrigger');
  const [autoChangelogCli, setAutoChangelogCli] = useSetting('autoChangelogCli');
  const [autoCommitCli, setAutoCommitCli] = useSetting('autoCommitCli');
  const [autoCommitCustomPrompt, setAutoCommitCustomPrompt] = useSetting('autoCommitCustomPrompt');

  // Memoized so callers can depend on `settings` without changing every render.
  return useMemo(() => ({
    sandboxEnabled, setSandboxEnabled,
    sandboxFailed, setSandboxFailed,
    networkIsolation, setNetworkIsolation,
    showTitleBar, setShowTitleBar,
    keepFilesAfterSend, setKeepFilesAfterSend,
    autoLaunchCli, setAutoLaunchCli,
    selectedCli, setSelectedCli,
    autoChangelogEnabled, setAutoChangelogEnabled,
    autoChangelogTarget, setAutoChangelogTarget,
    autoChangelogTrigger, setAutoChangelogTrigger,
    autoChangelogCli, setAutoChangelogCli,
    autoCommitCli, setAutoCommitCli,
    autoCommitCustomPrompt, setAutoCommitCustomPrompt,
  }), [
    sandboxEnabled, setSandboxEnabled, sandboxFailed, setSandboxFailed, networkIsolation, setNetworkIsolation, showTitleBar, setShowTitleBar, keepFilesAfterSend, setKeepFilesAfterSend, autoLaunchCli, setAutoLaunchCli, selectedCli, setSelectedCli, autoChangelogEnabled, setAutoChangelogEnabled, autoChangelogTarget, setAutoChangelogTarget, autoChangelogTrigger, setAutoChangelogTrigger, autoChangelogCli, setAutoChangelogCli, autoCommitCli, setAutoCommitCli, autoCommitCustomPrompt, setAutoCommitCustomPrompt,
  ]);
}
