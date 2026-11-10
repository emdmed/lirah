import { repoFiles } from '../../lib/fileStore';
import { plansBase } from './usePlanStore';

/**
 * Send `text` with `send`, then save it as
 * <repoRoot>/lirah/plans/<plan-id>/prompts/<n>-<kind>-<ts>.md.
 * Returns the chunk.prompts entry { kind, at, file }, or null when saving
 * failed: that only warns, since the prompt was already sent.
 */
export async function sendSaved(send, plan, chunk, kind, text, now = Date.now()) {
  await send(text);
  try {
    const file = await repoFiles(plansBase(plan.repoRoot)).writeText(`${plan.id}/prompts/${chunk.n}-${kind}-${now}.md`, text);
    return { kind, at: now, file };
  } catch (e) {
    console.warn('Failed to save the sent prompt:', e);
    return null;
  }
}
