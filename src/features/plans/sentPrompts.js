import { writeText } from '../../lib/fileStore';
import { planDir } from './planModel';

/**
 * Send `text` with `send`, then save it as
 * ~/.lirah/plans/<YYYY-MM>/<plan-id>/prompts/<n>-<kind>-<ts>.md.
 * Returns the chunk.prompts entry { kind, at, file }, or null when saving
 * failed: that only warns, since the prompt was already sent.
 */
export async function sendSaved(send, plan, chunk, kind, text, now = Date.now()) {
  await send(text);
  try {
    const file = await writeText(`${planDir(plan)}/prompts/${chunk.n}-${kind}-${now}.md`, text);
    return { kind, at: now, file };
  } catch (e) {
    console.warn('Failed to save the sent prompt:', e);
    return null;
  }
}
