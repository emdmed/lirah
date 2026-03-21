import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { HOOK_SCRIPTS, mergeHooksIntoSettings } from '../utils/orchestrationHookScripts';

const CDN_BASE = 'https://agentic-orchestration-workflows.vercel.app';
const ORCHESTRATION_CDN_URL = `${CDN_BASE}/orchestration/orchestration.md`;

// Simple string hash for version tracking
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export function useOrchestrationCheck() {
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);

  useEffect(() => {
    installingRef.current = installing;
  }, [installing]);

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

  const syncOrchestration = useCallback(async (projectPath) => {
    if (!projectPath || installingRef.current) return;

    setInstalling(true);
    installingRef.current = true;

    try {
      const response = await fetch(ORCHESTRATION_CDN_URL, {
        method: 'GET',
        headers: { 'Accept': 'text/plain' }
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch from CDN' };
      }

      const content = await response.text();

      await invoke('write_file_content', {
        path: `${projectPath}/.orchestration/orchestration.md`,
        content
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to sync orchestration:', error);
      return { success: false, error: error.message };
    } finally {
      setInstalling(false);
      installingRef.current = false;
    }
  }, []);

  // Full sync: orchestration.md + tool scripts via manifest + workflows
  const fullSync = useCallback(async (projectPath) => {
    if (!projectPath) return null;

    const summary = { orchestration: 'current', scripts: [], workflows: [] };

    try {
      // 1. Sync orchestration.md
      const orchResponse = await fetch(ORCHESTRATION_CDN_URL);
      if (orchResponse.ok) {
        const remoteContent = await orchResponse.text();
        let localContent = '';
        try {
          localContent = await invoke('read_file_content', {
            path: `${projectPath}/.orchestration/orchestration.md`
          });
        } catch { /* missing */ }

        if (localContent.trim().replace(/\r\n/g, '\n') !== remoteContent.trim().replace(/\r\n/g, '\n')) {
          await invoke('write_file_content', {
            path: `${projectPath}/.orchestration/orchestration.md`,
            content: remoteContent
          });
          summary.orchestration = 'updated';
        }
      }

      // 2. Sync tool scripts via manifest.json
      try {
        const manifestResponse = await fetch(`${CDN_BASE}/tools/manifest.json`);
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();

          for (const [scriptName, entry] of Object.entries(manifest)) {
            const expectedHash = typeof entry === 'object' ? entry.sha256 : entry;
            const localPath = `${projectPath}/.orchestration/tools/scripts/${scriptName}`;

            let needsUpdate = false;
            try {
              const localContent = await invoke('read_file_content', { path: localPath });
              // Simple content comparison since we can't do sha256 in browser easily
              const cdnResponse = await fetch(`${CDN_BASE}/tools/${scriptName}`);
              if (cdnResponse.ok) {
                const cdnContent = await cdnResponse.text();
                if (localContent.trim() !== cdnContent.trim()) {
                  needsUpdate = true;
                  await invoke('write_file_content', { path: localPath, content: cdnContent });
                }
              }
            } catch {
              // File missing, download it
              needsUpdate = true;
              const cdnResponse = await fetch(`${CDN_BASE}/tools/${scriptName}`);
              if (cdnResponse.ok) {
                const cdnContent = await cdnResponse.text();
                await invoke('write_file_content', { path: localPath, content: cdnContent });
              }
            }

            if (needsUpdate) {
              summary.scripts.push(scriptName);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to sync scripts via manifest:', e);
      }

      // 3. Sync workflows
      try {
        // Read local workflow files and compare with CDN
        const workflowDir = `${projectPath}/.orchestration/workflows`;
        const exists = await invoke('path_exists', { path: workflowDir });
        if (exists) {
          const entries = await invoke('read_directory', { path: workflowDir });
          const workflowFiles = await collectWorkflowFiles(entries, workflowDir);

          for (const relPath of workflowFiles) {
            try {
              const localContent = await invoke('read_file_content', {
                path: `${workflowDir}/${relPath}`
              });
              const cdnResponse = await fetch(`${CDN_BASE}/orchestration/workflows/${relPath}`);
              if (cdnResponse.ok) {
                const cdnContent = await cdnResponse.text();
                if (localContent.trim() !== cdnContent.trim()) {
                  await invoke('write_file_content', {
                    path: `${workflowDir}/${relPath}`,
                    content: cdnContent
                  });
                  summary.workflows.push(relPath);
                }
              }
            } catch (e) {
              console.warn(`Failed to sync workflow ${relPath}:`, e);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to sync workflows:', e);
      }

      return summary;
    } catch (error) {
      console.error('Full sync failed:', error);
      return null;
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

      // Also check if script files exist
      const classifyExists = await invoke('path_exists', { path: `${hooksDir}/classify.sh` });
      const maintainExists = await invoke('path_exists', { path: `${hooksDir}/maintain.sh` });
      const guardExists = await invoke('path_exists', { path: `${hooksDir}/guard-explore.sh` });

      // Check version freshness
      let outdated = false;
      try {
        const versionsContent = await invoke('read_file_content', {
          path: `${hooksDir}/.orchestration-versions.json`
        });
        const installedVersions = JSON.parse(versionsContent);
        for (const [filename, content] of Object.entries(HOOK_SCRIPTS)) {
          if (installedVersions[filename] !== simpleHash(content)) {
            outdated = true;
            break;
          }
        }
      } catch {
        // No version file = treat as outdated if hooks exist
        if (classifyExists || maintainExists || guardExists) {
          outdated = true;
        }
      }

      const allInstalled = classify && maintain && guard && classifyExists && maintainExists && guardExists;

      return {
        installed: allInstalled,
        outdated: allInstalled && outdated,
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

  // Install hooks to ~/.claude/hooks/ and update settings.json
  const installHooks = useCallback(async () => {
    try {
      const homeDir = await invoke('get_home_dir');
      const hooksDir = `${homeDir}/.claude/hooks`;
      const settingsPath = `${homeDir}/.claude/settings.json`;

      // Write each hook script and track versions
      const versionMap = {};
      for (const [filename, content] of Object.entries(HOOK_SCRIPTS)) {
        const scriptPath = `${hooksDir}/${filename}`;
        await invoke('write_file_content', { path: scriptPath, content });
        await invoke('set_file_executable', { path: scriptPath });
        versionMap[filename] = simpleHash(content);
      }

      // Write version metadata
      await invoke('write_file_content', {
        path: `${hooksDir}/.orchestration-versions.json`,
        content: JSON.stringify(versionMap, null, 2)
      });

      // Read existing settings and merge hooks config
      let existingSettings = {};
      try {
        const settingsContent = await invoke('read_file_content', { path: settingsPath });
        existingSettings = JSON.parse(settingsContent);
      } catch {
        // settings.json doesn't exist yet
      }

      const updatedSettings = mergeHooksIntoSettings(existingSettings, hooksDir);
      await invoke('write_file_content', {
        path: settingsPath,
        content: JSON.stringify(updatedSettings, null, 2)
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to install hooks:', error);
      return { success: false, error: error.message };
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

      // Check if outdated
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
    // Known workflows from the orchestration protocol classification table
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

      // Check CDN availability
      try {
        const res = await fetch(`${CDN_BASE}/orchestration/workflows/${wf.path}`, { method: 'HEAD' });
        entry.cdnAvailable = res.ok;
      } catch { /* unavailable */ }

      // Check local
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

      // Ensure parent directory exists by writing the file (write_file_content creates dirs)
      await invoke('write_file_content', { path: localPath, content });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  return useMemo(() => ({
    checkOrchestration,
    syncOrchestration,
    fullSync,
    installHooks,
    checkHooksInstalled,
    getOrchestrationStatus,
    getAvailableWorkflows,
    installWorkflow,
    // Keep old names as aliases for backward compat in App.jsx
    installOrchestration: syncOrchestration,
    updateOrchestration: syncOrchestration,
    installing
  }), [checkOrchestration, syncOrchestration, fullSync, installHooks, checkHooksInstalled, getOrchestrationStatus, getAvailableWorkflows, installWorkflow, installing]);
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
