import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

const CDN_BASE = 'https://agentic-orchestration-workflows.vercel.app';
const ORCHESTRATION_CDN_URL = `${CDN_BASE}/orchestration/orchestration.md`;

export function useOrchestrationCheck() {
  const checkOrchestration = useCallback(async (projectPath) => {
    if (!projectPath) return { status: 'missing' };

    try {
      const localContent = await invoke('read_file_content', {
        path: `${projectPath}/.orchestration/orchestration.md`
      });

      try {
        const response = await fetch(ORCHESTRATION_CDN_URL, {
          method: 'GET',
          headers: { 'Accept': 'text/plain' }
        });

        if (!response.ok) return { status: 'installed' };

        const remoteContent = await response.text();
        const normalizedLocal = localContent.trim().replace(/\r\n/g, '\n');
        const normalizedRemote = remoteContent.trim().replace(/\r\n/g, '\n');

        return { status: normalizedLocal === normalizedRemote ? 'installed' : 'outdated' };
      } catch {
        return { status: 'installed' };
      }
    } catch {
      return { status: 'missing' };
    }
  }, []);

  // Check if hooks are installed in ~/.claude/settings.json
  const checkHooksInstalled = useCallback(async () => {
    try {
      const homeDir = await invoke('get_home_dir');
      const settingsPath = `${homeDir}/.claude/settings.json`;

      let settings;
      try {
        const content = await invoke('read_file_content', { path: settingsPath });
        settings = JSON.parse(content);
      } catch {
        return { installed: false, hooks: { classify: false, maintain: false, guard: false } };
      }

      const hooks = settings.hooks || {};
      const hooksDir = `${homeDir}/.claude/hooks`;

      const classify = !!(hooks.UserPromptSubmit?.some(entry =>
        entry.hooks?.some(h => h.command?.includes('classify.sh'))
      ));
      const maintain = !!(hooks.SessionStart?.some(entry =>
        entry.hooks?.some(h => h.command?.includes('maintain.sh'))
      ));
      const guard = !!(hooks.PreToolUse?.some(entry =>
        entry.hooks?.some(h => h.command?.includes('guard-explore.sh'))
      ));

      const classifyExists = await invoke('path_exists', { path: `${hooksDir}/classify.sh` });
      const maintainExists = await invoke('path_exists', { path: `${hooksDir}/maintain.sh` });
      const guardExists = await invoke('path_exists', { path: `${hooksDir}/guard-explore.sh` });

      const allInstalled = classify && maintain && guard && classifyExists && maintainExists && guardExists;

      return {
        installed: allInstalled,
        hooks: {
          classify: classify && classifyExists,
          maintain: maintain && maintainExists,
          guard: guard && guardExists,
        }
      };
    } catch (error) {
      console.error('Failed to check hooks:', error);
      return { installed: false, hooks: { classify: false, maintain: false, guard: false } };
    }
  }, []);

  // Get full orchestration status for dashboard
  const getOrchestrationStatus = useCallback(async (projectPath) => {
    if (!projectPath) return null;

    const status = {
      protocol: 'missing',
      scripts: {},
      workflows: [],
      patterns: false,
    };

    // Check protocol
    try {
      await invoke('read_file_content', {
        path: `${projectPath}/.orchestration/orchestration.md`
      });
      status.protocol = 'installed';

      try {
        const response = await fetch(ORCHESTRATION_CDN_URL);
        if (response.ok) {
          const remote = await response.text();
          const local = await invoke('read_file_content', {
            path: `${projectPath}/.orchestration/orchestration.md`
          });
          if (local.trim().replace(/\r\n/g, '\n') !== remote.trim().replace(/\r\n/g, '\n')) {
            status.protocol = 'outdated';
          }
        }
      } catch { /* keep as installed */ }
    } catch {
      status.protocol = 'missing';
    }

    // Check scripts
    const scriptNames = ['compaction.js', 'dep-graph.js', 'symbols.js'];
    for (const name of scriptNames) {
      const path = `${projectPath}/.orchestration/tools/scripts/${name}`;
      const exists = await invoke('path_exists', { path });
      status.scripts[name] = exists ? 'installed' : 'missing';
    }

    // Check workflows
    try {
      const workflowDir = `${projectPath}/.orchestration/workflows`;
      const exists = await invoke('path_exists', { path: workflowDir });
      if (exists) {
        const entries = await invoke('read_directory', { path: workflowDir });
        status.workflows = await collectWorkflowFiles(entries, workflowDir);
      }
    } catch { /* no workflows */ }

    // Check patterns
    try {
      status.patterns = await invoke('path_exists', {
        path: `${projectPath}/.patterns/patterns.md`
      });
    } catch {
      status.patterns = false;
    }

    return status;
  }, []);

  // Fetch available workflows from CDN and compare with local
  const getAvailableWorkflows = useCallback(async (projectPath) => {
    const KNOWN_WORKFLOWS = [
      { path: 'react/feature.md', label: 'Feature (React)' },
      { path: 'react/bugfix.md', label: 'Bugfix (React)' },
      { path: 'react/refactor.md', label: 'Refactor (React)' },
      { path: 'react/performance.md', label: 'Performance (React)' },
      { path: 'react/review.md', label: 'Review (React)' },
      { path: 'react/pr.md', label: 'PR (React)' },
      { path: 'react/test.md', label: 'Test (React)' },
      { path: 'react/docs.md', label: 'Docs (React)' },
      { path: 'todo.md', label: 'Todo / Multi-step' },
      { path: 'patterns-gen.md', label: 'Patterns Generator' },
    ];

    const workflowDir = projectPath ? `${projectPath}/.orchestration/workflows` : null;
    const results = [];

    await Promise.all(KNOWN_WORKFLOWS.map(async (wf) => {
      const entry = { ...wf, cdnAvailable: false, localInstalled: false };

      try {
        const res = await fetch(`${CDN_BASE}/orchestration/workflows/${wf.path}`, { method: 'HEAD' });
        entry.cdnAvailable = res.ok;
      } catch { /* unavailable */ }

      if (workflowDir) {
        try {
          entry.localInstalled = await invoke('path_exists', { path: `${workflowDir}/${wf.path}` });
        } catch { /* not installed */ }
      }

      results.push(entry);
    }));

    return results;
  }, []);

  // Install a single workflow from CDN
  const installWorkflow = useCallback(async (projectPath, workflowPath) => {
    try {
      const response = await fetch(`${CDN_BASE}/orchestration/workflows/${workflowPath}`);
      if (!response.ok) return { success: false, error: 'Failed to fetch workflow' };

      const content = await response.text();
      const localPath = `${projectPath}/.orchestration/workflows/${workflowPath}`;

      await invoke('write_file_content', { path: localPath, content });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  return useMemo(() => ({
    checkOrchestration,
    checkHooksInstalled,
    getOrchestrationStatus,
    getAvailableWorkflows,
    installWorkflow,
  }), [checkOrchestration, checkHooksInstalled, getOrchestrationStatus, getAvailableWorkflows, installWorkflow]);
}

// Helper to recursively collect .md files from directory entries
async function collectWorkflowFiles(entries, baseDir, prefix = '') {
  const files = [];
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.is_dir) {
      try {
        const subEntries = await invoke('read_directory', { path: `${baseDir}/${relPath}` });
        const subFiles = await collectWorkflowFiles(subEntries, baseDir, relPath);
        files.push(...subFiles);
      } catch { /* skip */ }
    } else if (entry.name.endsWith('.md')) {
      files.push(relPath);
    }
  }
  return files;
}
