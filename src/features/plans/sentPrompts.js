import { writeText } from '../../lib/fileStore';

/**
 * Send `text` with `send`, then save it as
 * ~/.lirah/workspaces/<ws>/plans/<plan-id>/prompts/<n>-<kind>-<ts>.md.
 * Returns the chunk.prompts entry { kind, at, file }, or null when saving
 * failed: that only warns, since the prompt was already sent.
 */
export async function sendSaved(send, plan, chunk, kind, text, now = Date.now()) {
  await send(text);
  try {
    if (!plan.workspaceId) throw new Error('plan has no workspace');
    const file = await writeText(`workspaces/${plan.workspaceId}/plans/${plan.id}/prompts/${chunk.n}-${kind}-${now}.md`, text);
    return { kind, at: now, file };
  } catch (e) {
    console.warn('Failed to save the sent prompt:', e);
    return null;
  }
}
