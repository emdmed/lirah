import { invoke } from '@tauri-apps/api/core';
import { remove, writeText } from '../../lib/fileStore';
import { artifactName, artifactsRel } from '../../lib/lirahPaths';

// A repo's HTML artifacts in ~/.lirah/artifacts/<repo>/. The CLI's file-only
// fallbacks (src-tauri/src/lirah_cli.js) do the same on disk; keep them in step.

/** The artifacts stored for a repo, sorted by name. */
export const listArtifacts = (repo) => invoke('store_list', { rel: artifactsRel(repo) })
  .then((names) => names.filter((n) => n.endsWith('.html')));

/** An artifact's absolute path, e.g. to attach it as context. */
export const artifactPath = async (repo, name) => `${await invoke('get_home_dir')}/.lirah/${artifactsRel(repo)}/${name}`;

/** Store `html` as `name` (made safe, .html added); resolves with the stored name and its absolute path. */
export async function saveArtifact(repo, name, html) {
  const safe = artifactName(name);
  return { name: safe, path: await writeText(`${artifactsRel(repo)}/${safe}`, html) };
}

async function existing(repo, name) {
  const safe = artifactName(name ?? '');
  if (!(await listArtifacts(repo)).includes(safe)) throw new Error(`no artifact "${name}" (see \`lirah artifacts\`)`);
  return safe;
}

/** Rename an artifact; refuses to overwrite another one. Resolves with the new name. */
export async function renameArtifact(repo, from, to) {
  const old = await existing(repo, from);
  const next = artifactName(to);
  if (next === old) return next;
  if ((await listArtifacts(repo)).includes(next)) throw new Error(`an artifact named "${next}" already exists`);
  const html = await invoke('store_read_text', { rel: `${artifactsRel(repo)}/${old}` });
  await writeText(`${artifactsRel(repo)}/${next}`, html ?? '');
  await remove(`${artifactsRel(repo)}/${old}`);
  return next;
}

/** Delete an artifact. Resolves with its name. */
export async function deleteArtifact(repo, name) {
  const safe = await existing(repo, name);
  await remove(`${artifactsRel(repo)}/${safe}`);
  return safe;
}
