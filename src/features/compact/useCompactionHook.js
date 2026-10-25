import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabActions } from "../tabs/TabContext";
import { useSetting } from "../settings/settingsStore";

/**
 * The tab's compaction hook switch. While the "Compaction hook" setting is on,
 * Lirah loads its compaction plugin into every Claude Code it launches; the
 * hook only runs for terminals switched on here, so a toggle applies on the
 * agent's next prompt without a restart.
 */
export function useCompactionHook({ tabId, terminalSessionId, enabled: tabEnabled }) {
  const { setTabCompaction } = useTabActions();
  const [available] = useSetting('compactionHook');
  const enabled = available && tabEnabled;

  // Mirror the switch onto the tab's current terminal (a new shell gets a new id).
  useEffect(() => {
    if (!terminalSessionId) return;
    invoke('set_compaction_hook', { sessionId: terminalSessionId, enabled })
      .catch((error) => console.warn('Failed to set the compaction hook:', error));
  }, [terminalSessionId, enabled]);

  const toggleCompaction = useCallback(() => {
    if (available) setTabCompaction(tabId, !enabled);
  }, [available, setTabCompaction, tabId, enabled]);

  return { compactionAvailable: available, compactionEnabled: enabled, toggleCompaction };
}
