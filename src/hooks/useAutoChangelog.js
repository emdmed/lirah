import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useAutoChangelog(currentPath, enabled, targetFile = "CHANGELOG.md", trigger = "commit", cli = "claude-code") {
  const [status, setStatus] = useState(null); // null | 'updating' | 'done' | 'error'
  const watcherStarted = useRef(null);
  const dismissTimer = useRef(null);

  // Start/stop commit watcher when path or enabled changes
  useEffect(() => {
    if (!currentPath || !enabled) {
      if (watcherStarted.current) {
        invoke("stop_commit_watcher", { repoPath: watcherStarted.current }).catch(() => {});
        watcherStarted.current = null;
      }
      return;
    }

    // Start watcher for current path
    invoke("start_commit_watcher", { repoPath: currentPath })
      .then(() => {
        watcherStarted.current = currentPath;
      })
      .catch((err) => {
        console.warn("Failed to start commit watcher:", err);
      });

    return () => {
      if (watcherStarted.current) {
        invoke("stop_commit_watcher", { repoPath: watcherStarted.current }).catch(() => {});
        watcherStarted.current = null;
      }
    };
  }, [currentPath, enabled]);

  // Listen for commit-detected events
  useEffect(() => {
    if (!enabled) return;

    const unlisten = listen("commit-detected", async (event) => {
      const { repo_path, commit_hash, branch } = event.payload;

      // Only respond if it matches our current path
      if (repo_path !== currentPath) return;

      // Filter by trigger mode
      if (trigger === 'merge' && branch !== 'main' && branch !== 'master') return;

      setStatus("updating");
      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      // Use branch-prefixed filename when on a non-main branch with per-commit trigger
      const isMainBranch = branch === 'main' || branch === 'master';
      const effectiveFile = (!isMainBranch && trigger === 'commit') ? `${branch}-${targetFile}` : targetFile;

      const prompt = `Check the latest commit with git diff HEAD~1 HEAD and git log -1. Update ${effectiveFile} at the project root: add an entry under today's date with a concise summary of what changed. Create the file if it doesn't exist. Use Keep a Changelog format. Do not include the full diff in the changelog, just a human-readable summary.`;

      try {
        // Use claude -p (headless mode that can use tools/write files), NOT --print (stdout only)
        // Use single quotes to avoid shell escaping issues with the prompt
        const escaped = prompt.replace(/'/g, "'\\''");
        const command = cli === 'opencode'
          ? `opencode run -m opencode/kimi-k2.5-free '${escaped}'`
          : `claude -p '${escaped}' --allowedTools 'Bash(git diff:*),Bash(git log:*),Read,Write'`;
        const sessionId = await invoke("spawn_hidden_terminal", {
          projectDir: repo_path,
          command,
        });

        // Listen for this hidden terminal to close
        const unlistenClose = await listen("hidden-terminal-closed", (closeEvent) => {
          if (closeEvent.payload.session_id === sessionId) {
            setStatus(closeEvent.payload.error ? "error" : "done");
            dismissTimer.current = setTimeout(() => setStatus(null), 4000);
            unlistenClose();
          }
        });
      } catch (err) {
        console.error("Failed to spawn hidden terminal for changelog:", err);
        setStatus("error");
        dismissTimer.current = setTimeout(() => setStatus(null), 4000);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [enabled, currentPath, targetFile, trigger, cli]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const dismissStatus = useCallback(() => setStatus(null), []);

  return { changelogStatus: status, dismissChangelogStatus: dismissStatus };
}
