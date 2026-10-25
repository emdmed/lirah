import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { subscribeAgentHooks } from "../features/tabs/agentHookState";

const WRITE_DELAY_MS = 250;
// How long `justAttached` stays true after the hook used the context.
const ATTACHED_MS = 2500;

/**
 * Makes the prompt box's selected context (files, elements, repos, template,
 * patterns) reach prompts typed straight into the terminal.
 *
 * The context is mirrored to ~/.lirah/prompt-context/<session>.md; Lirah's
 * Claude Code hook adds it to the next prompt submitted there. When it does,
 * `onContextUsed` runs so the selection resets as after a prompt-box send,
 * and for a moment `attachedSummary` holds what went (`contextSummary` as it
 * was then), since the selection it describes is already gone.
 */
export function usePromptContextSync({ terminalSessionId, contextText, contextSummary, onContextUsed }) {
  const summaryRef = useRef(contextSummary);
  summaryRef.current = contextSummary;

  useEffect(() => {
    if (!terminalSessionId) return undefined;
    const timer = setTimeout(() => {
      invoke("set_prompt_context", { sessionId: terminalSessionId, text: contextText || "" })
        .catch((e) => console.debug("Prompt context not mirrored:", e));
    }, WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [terminalSessionId, contextText]);

  const [attached, setAttached] = useState(null); // { at, summary }
  useEffect(() => {
    if (!terminalSessionId) return undefined;
    return subscribeAgentHooks((change) => {
      if (change.sessionId !== terminalSessionId || !change.contextUsed) return;
      setAttached({ at: Date.now(), summary: summaryRef.current || 'context' });
      onContextUsed?.();
    });
  }, [terminalSessionId, onContextUsed]);

  useEffect(() => {
    if (!attached) return undefined;
    const timer = setTimeout(() => setAttached(null), ATTACHED_MS);
    return () => clearTimeout(timer);
  }, [attached]);

  return { attachedSummary: attached?.summary || null };
}
