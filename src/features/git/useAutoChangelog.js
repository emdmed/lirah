import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { git } from "../../lib/git";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "../toast/ToastContext";

// Every tab open on the same repo receives the same commit-detected event.
// The first to claim a commit runs the changelog CLI; the rest skip it, so one
// commit never spawns N `claude -p` runs editing the same file.
const claimedCommits = new Set();

export function useAutoChangelog(currentPath, enabled, targetFile = "CHANGELOG.md", trigger = "commit", cli = "claude-code") {
  const [status, setStatus] = useState(null); // null | 'updating' | 'done' | 'error'
  const dismissTimer = useRef(null);
  // Track per-commit "hidden-terminal-closed" listeners so they can't leak if
  // the close event never arrives or the component unmounts while pending.
  const closeListenersRef = useRef(new Set());
  const { success: toastSuccess, error: toastError } = useToast();

  // Start/stop commit watcher when path or enabled changes
  useEffect(() => {
    // The previous run's cleanup already released its watcher.
    if (!currentPath || !enabled) return;

    // Start watcher for current path. Commit watchers are ref-counted per
    // repo, so the stop is chained onto the start: a cleanup that runs before
    // the start resolves must still release it, exactly once.
    const repoPath = currentPath;
    const started = invoke("start_commit_watcher", { repoPath })
      .then(() => true)
      .catch((err) => {
        console.warn("Failed to start commit watcher:", err);
        return false;
      });

    return () => {
      started.then((ok) => {
        if (!ok) return;
        invoke("stop_commit_watcher", { repoPath }).catch(() => {});
      });
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

      const commitKey = `${repo_path}\0${commit_hash}`;
      if (claimedCommits.has(commitKey)) return;
      claimedCommits.add(commitKey);

      setStatus("updating");
      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      // Use branch-prefixed filename when on a non-main branch with per-commit trigger
      const isMainBranch = branch === 'main' || branch === 'master';
      const effectiveFile = (!isMainBranch && trigger === 'commit') ? `${branch}-${targetFile}` : targetFile;

      const prompt = `Check the latest commit with git diff HEAD~1 HEAD and git log -1. Update ${effectiveFile} at the project root: add an entry under today's date with a concise summary of what changed. Create the file if it doesn't exist. Use Keep a Changelog format. Do not include the full diff in the changelog, just a human-readable summary.`;

      // The agent edits the file unseen, so keep what was there to offer Undo.
      // null = the file didn't exist (undo removes the one the agent created).
      const filePath = `${repo_path.replace(/\/+$/, "")}/${effectiveFile}`;
      let before = null;
      try {
        if (await invoke("path_exists", { path: filePath })) {
          before = await invoke("read_file_content", { path: filePath });
        }
      } catch {
        before = undefined; // Unknown: no undo offered.
      }
      const undo = async () => {
        try {
          if (before === null) {
            await git(repo_path, ["clean", "-f", "--", effectiveFile]);
            // clean skips ignored, staged or committed files; don't claim success then.
            if (await invoke("path_exists", { path: filePath })) {
              toastError(`Couldn't remove ${effectiveFile} (it's ignored or already staged) — delete it manually.`);
              return;
            }
          } else {
            await invoke("write_file_content", { path: filePath, content: before });
          }
          toastSuccess(`Changelog change undone: ${effectiveFile}`);
        } catch (err) {
          toastError(`Couldn't undo the changelog change: ${err?.message || err}`);
        }
      };

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
            const failed = !!closeEvent.payload.error;
            setStatus(failed ? "error" : "done");
            dismissTimer.current = setTimeout(() => setStatus(null), 4000);
            if (failed) {
              toastError(`Auto-changelog failed to update ${effectiveFile}.`);
            } else {
              invoke("read_file_content", { path: filePath })
                .catch(() => null)
                .then((after) => {
                  if (after === null) return; // Nothing written (or unreadable).
                  if (after === before) return; // Agent left it unchanged.
                  toastSuccess(`Changelog updated: ${effectiveFile}`, {
                    duration: 15000,
                    action: before === undefined ? undefined : { label: "Undo", onClick: undo },
                  });
                });
            }
            unlistenClose();
            closeListenersRef.current.delete(unlistenClose);
          }
        });
        closeListenersRef.current.add(unlistenClose);
      } catch (err) {
        console.error("Failed to spawn hidden terminal for changelog:", err);
        toastError(`Auto-changelog couldn't start: ${err?.message || err}`);
        setStatus("error");
        dismissTimer.current = setTimeout(() => setStatus(null), 4000);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [enabled, currentPath, targetFile, trigger, cli, toastSuccess, toastError]);

  // Cleanup timer and any pending close-listeners on unmount
  useEffect(() => {
    const closeListeners = closeListenersRef.current;
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      for (const unlistenClose of closeListeners) unlistenClose();
      closeListeners.clear();
    };
  }, []);

  const dismissStatus = useCallback(() => setStatus(null), []);

  return { changelogStatus: status, dismissChangelogStatus: dismissStatus };
}
