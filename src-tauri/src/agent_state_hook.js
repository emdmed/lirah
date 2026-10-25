// Lirah agent-state hook (Claude Code). Appends the hook payload (JSON on
// stdin) to this terminal's event log as one line. On UserPromptSubmit it
// also adds the context selected in Lirah's prompt box (mirrored to
// LIRAH_PROMPT_CONTEXT/<session>.md) to a prompt typed in the terminal.
// Does nothing outside a Lirah terminal.

import { appendFileSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const session = process.env.LIRAH_PTY_SESSION;
const dir = process.env.LIRAH_AGENT_EVENTS;
const contextDir = process.env.LIRAH_PROMPT_CONTEXT;

const squash = (s) => s.replace(/\s+/g, '');

// The selected context, unless the prompt already carries it (the prompt box
// types it in with the prompt).
function pendingContext(prompt) {
  if (!contextDir) return null;
  let text;
  try {
    text = readFileSync(join(contextDir, `${session}.md`), 'utf8');
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  if (typeof prompt === 'string' && squash(prompt).includes(squash(text))) return null;
  return text;
}

async function main() {
  if (!session || !dir) return;
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return;

  let line;
  try {
    // Drop PostToolUse's tool_response (file contents, command output): Lirah
    // only needs the tool and its input.
    const payload = JSON.parse(raw);
    delete payload.tool_response;
    if (payload.hook_event_name === 'UserPromptSubmit') {
      const context = pendingContext(payload.prompt);
      if (context) {
        // writeSync: process.exit below would cut off a buffered pipe write.
        writeSync(1, JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: `Context the user selected in Lirah for this prompt:\n\n${context}`,
          },
        }));
        // Tells Lirah to reset the selection, as after a prompt-box send.
        payload.lirah_context = true;
      }
      // The prompt can be long and Lirah doesn't read it.
      delete payload.prompt;
    }
    line = JSON.stringify(payload);
  } catch {
    line = raw.replace(/\r?\n/g, '');
  }
  appendFileSync(join(dir, `${session}.jsonl`), line + '\n');
}

// A hook that fails must never block the agent.
main().catch(() => {}).finally(() => process.exit(0));
