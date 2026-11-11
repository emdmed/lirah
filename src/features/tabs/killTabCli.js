// Stop the CLI running under a tab's shell. Resolves true when one was stopped
// (its pid is gone), false when none was running. Rejects when a CLI is running
// and could not be stopped, so the caller never types into it.
export async function killTabCli({ invoke, sessionId, names }) {
  for (const processName of names) {
    if (await invoke('kill_pty_child_process', { sessionId, processName })) return true;
  }
  return false;
}
