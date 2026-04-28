import { useState, useCallback } from 'react';
import { useSubagents } from './useSubagents';

export function useAgentOverlay({ currentPath }) {
  const { subagents, activeCount: activeSubagentCount } = useSubagents(currentPath);
  const [visible, setVisible] = useState(true);

  const toggleVisible = useCallback(() => setVisible(v => !v), []);

  return {
    subagents,
    visible,
    setVisible,
    toggleVisible,
    activeSubagentCount,
  };
}
