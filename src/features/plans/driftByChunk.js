import { isReleaseBumpFile } from '../worklog/releaseFiles';
import { CHUNK_STATUS } from './planModel';

// A planned entry covers itself and, when it's a folder, anything beneath it.
const covers = (entry, path) => {
  const e = entry.replace(/\/+$/, '');
  return path === e || path.startsWith(`${e}/`);
};

/**
 * Planned vs touched files per implemented chunk, pure. `byRepo` is
 * usePlanCommitFiles' { [chunkId]: { [root]: paths } }; chunks without commits are left out.
 * Returns [{ n, title, planned, touched, extra, missed, minutes, nudged }]; minutes is null without timestamps.
 */
export function driftByChunk(plan, byRepo) {
  return (plan?.chunks ?? [])
    .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && byRepo[c.id])
    .map((c) => {
      const planned = c.files ?? [];
      const touched = [...new Set(Object.values(byRepo[c.id]).flat())].filter((p) => !isReleaseBumpFile(p)).sort();
      const firstAt = c.prompts?.[0]?.at;
      return {
        n: c.n,
        title: c.title,
        planned,
        touched,
        extra: touched.filter((p) => !planned.some((e) => covers(e, p))),
        missed: planned.filter((e) => !touched.some((p) => covers(e, p))),
        minutes: firstAt && c.doneAt ? Math.round((c.doneAt - firstAt) / 60000) : null,
        nudged: (c.prompts ?? []).some((p) => p.kind === 'nudge'),
      };
    });
}

/** The row that overshot its plan most (touched >= 3x planned and >= 10), or null. */
export function overshootChunk(rows) {
  return rows
    .filter((r) => r.touched.length >= 10 && r.touched.length >= 3 * r.planned.length)
    .reduce((best, r) => (!best || r.touched.length > best.touched.length ? r : best), null);
}
