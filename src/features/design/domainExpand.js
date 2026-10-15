/**
 * Pass two of a project diagram: replace one domain's coarse nodes with a
 * detailed breakdown, without touching the rest of the spec.
 *
 * A whole repository cannot be described part-by-part in one extraction — it
 * either blows the node budget or gets abstracted until it says nothing. So the
 * first pass writes the domains and features with a few coarse nodes each, and
 * this pass is run on demand, one domain at a time, when the reader drills in.
 *
 * The extractor writes a *fragment* rather than a whole spec:
 *
 *   { domain, groups?, nodes, flows?, concerns? }
 *
 * and this module splices it in. The hard part is the arrows that cross the
 * domain's border: other domains' flows point at the coarse nodes being
 * removed. Each new node lists the old ids it `replaces`, and every reference to
 * an old node — in flows, concerns and the concepts block — is rewritten to its
 * replacement. A reference with no replacement is dropped and counted, so the
 * caller can say how much wiring was lost rather than losing it silently.
 */

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Ids of the groups that make up `domainId`: itself plus its features. */
function subtreeOf(spec, domainId) {
  const ids = new Set([domainId]);
  for (const g of spec.groups || []) if (g.parent === domainId) ids.add(g.id);
  return ids;
}

/** Ids of the nodes currently filed under `domainId`. */
export function nodesInDomain(spec, domainId) {
  const subtree = subtreeOf(spec, domainId);
  return new Set((spec.nodes || []).filter((n) => subtree.has(n.group)).map((n) => n.id));
}

/**
 * Check a fragment against the spec it will be merged into. Errors are phrased
 * for the repair prompt, with paths into the fragment.
 *
 * @returns {{ ok: boolean, errors: Array<{path: string, message: string}> }}
 */
export function validateFragment(spec, domainId, fragment) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });

  if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) {
    return { ok: false, errors: [{ path: '', message: 'fragment must be a JSON object' }] };
  }
  if (fragment.domain !== domainId) err('domain', `must be "${domainId}"`);

  const oldSubtree = subtreeOf(spec, domainId);
  const outsideGroups = new Set(
    (spec.groups || []).map((g) => g.id).filter((id) => !oldSubtree.has(id))
  );

  // The features this domain will have after the merge.
  let features = new Set([...oldSubtree].filter((id) => id !== domainId));
  if (fragment.groups !== undefined) {
    if (!Array.isArray(fragment.groups)) {
      err('groups', 'must be an array when present');
    } else {
      features = new Set();
      fragment.groups.forEach((g, i) => {
        const at = `groups[${i}]`;
        if (!g || typeof g !== 'object') return err(at, 'must be an object');
        if (!isNonEmptyString(g.id)) err(`${at}.id`, 'must be a non-empty string');
        else if (g.id === domainId || outsideGroups.has(g.id) || features.has(g.id)) {
          err(`${at}.id`, `"${g.id}" is already used by another group`);
        } else features.add(g.id);
        if (!isNonEmptyString(g.label)) err(`${at}.label`, 'must be a non-empty string');
        if (!isNonEmptyString(g.purpose)) err(`${at}.purpose`, 'must be a non-empty string');
        if (g.parent !== undefined && g.parent !== domainId) {
          err(`${at}.parent`, `must be "${domainId}" — features of this domain only`);
        }
      });
    }
  }

  const oldNodes = nodesInDomain(spec, domainId);
  const outsideNodes = new Set(
    (spec.nodes || []).map((n) => n.id).filter((id) => !oldNodes.has(id))
  );
  const layerIds = new Set((spec.layers || []).map((l) => l.id));
  const newIds = new Set();

  if (!Array.isArray(fragment.nodes) || fragment.nodes.length === 0) {
    err('nodes', 'must be a non-empty array');
  } else {
    fragment.nodes.forEach((n, i) => {
      const at = `nodes[${i}]`;
      if (!n || typeof n !== 'object') return err(at, 'must be an object');
      if (!isNonEmptyString(n.id)) err(`${at}.id`, 'must be a non-empty string');
      else if (newIds.has(n.id)) err(`${at}.id`, `duplicate node id "${n.id}"`);
      else if (outsideNodes.has(n.id)) {
        err(`${at}.id`, `"${n.id}" belongs to another domain — pick a new id`);
      } else newIds.add(n.id);
      if (!isNonEmptyString(n.label)) err(`${at}.label`, 'must be a non-empty string');
      if (!isNonEmptyString(n.responsibility)) {
        err(`${at}.responsibility`, 'must be a non-empty string — one sentence on what this does');
      }
      if (!layerIds.has(n.layer)) {
        err(`${at}.layer`, `must be one of the existing layers: ${[...layerIds].join(', ')}`);
      }
      if (n.group !== domainId && !features.has(n.group)) {
        err(`${at}.group`, `must be "${domainId}" or one of its features: ${[...features].join(', ')}`);
      }
      if (n.replaces !== undefined) {
        if (!isStringArray(n.replaces)) err(`${at}.replaces`, 'must be an array of node ids');
        else {
          for (const id of n.replaces) {
            if (!oldNodes.has(id)) {
              err(`${at}.replaces`, `"${id}" is not one of this domain's current nodes`);
            }
          }
        }
      }
    });
  }

  const known = (id) => newIds.has(id) || outsideNodes.has(id);
  if (fragment.flows !== undefined && !Array.isArray(fragment.flows)) {
    err('flows', 'must be an array when present');
  } else {
    (fragment.flows || []).forEach((f, i) => {
      const at = `flows[${i}]`;
      if (!f || typeof f !== 'object') return err(at, 'must be an object');
      if (!isNonEmptyString(f.label)) err(`${at}.label`, 'must be a non-empty string');
      if (!Array.isArray(f.steps) || f.steps.length === 0) {
        return err(`${at}.steps`, 'must be a non-empty array');
      }
      f.steps.forEach((step, j) => {
        for (const end of ['from', 'to']) {
          if (!known(step?.[end])) {
            err(
              `${at}.steps[${j}].${end}`,
              `"${step?.[end]}" is neither a node in this fragment nor a node of another domain`
            );
          }
        }
      });
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Splice a validated fragment into a raw spec. Pure: returns a new spec.
 *
 * @returns {{ spec: object, dropped: number, replaced: number }}
 *   `dropped` counts references to removed nodes that had no replacement.
 */
export function mergeDomainDetail(spec, domainId, fragment) {
  const oldNodes = nodesInDomain(spec, domainId);
  const newIds = new Set(fragment.nodes.map((n) => n.id));

  // old id → new id. A new node reusing an old id is its own replacement.
  const remap = new Map();
  for (const n of fragment.nodes) {
    if (oldNodes.has(n.id)) remap.set(n.id, n.id);
    for (const old of n.replaces || []) if (!remap.has(old)) remap.set(old, n.id);
  }

  let dropped = 0;
  const resolve = (id) => {
    if (!oldNodes.has(id)) return id;
    const to = remap.get(id);
    if (!to) dropped += 1;
    return to;
  };

  const groups = fragment.groups
    ? [
        ...(spec.groups || []).filter((g) => g.parent !== domainId),
        ...fragment.groups.map((g) => ({ ...g, parent: domainId })),
      ]
    : [...(spec.groups || [])];
  const merged = groups.map((g) => (g.id === domainId ? { ...g, expanded: true } : g));

  const nodes = [
    ...(spec.nodes || []).filter((n) => !oldNodes.has(n.id)),
    ...fragment.nodes.map(({ replaces, ...n }) => n),
  ];

  // Existing flows are rewired; a step that lost an end is dropped, and so is a
  // flow left with no steps.
  const flows = [];
  for (const flow of spec.flows || []) {
    const steps = [];
    for (const step of flow.steps || []) {
      const from = resolve(step.from);
      const to = resolve(step.to);
      if (from && to && from !== to) steps.push({ ...step, from, to });
    }
    if (steps.length) flows.push({ ...flow, steps });
  }
  const takenFlowIds = new Set(flows.map((f) => f.id).filter(Boolean));
  for (const [i, flow] of (fragment.flows || []).entries()) {
    let id = flow.id || `${domainId}-flow-${i}`;
    while (takenFlowIds.has(id)) id = `${id}-${domainId}`;
    takenFlowIds.add(id);
    flows.push({ ...flow, id });
  }

  const concerns = [
    ...(spec.concerns || []).map((c) => {
      if (!c.node || !oldNodes.has(c.node)) return c;
      const node = remap.get(c.node);
      if (node) return { ...c, node };
      const { node: _gone, ...rest } = c;
      return rest;
    }),
    ...(fragment.concerns || []).filter((c) => !c.node || newIds.has(c.node) || !oldNodes.has(c.node)),
  ];

  // The concepts block links back to nodes too; follow the same remap, quietly
  // — losing a "show these parts" link is not worth a warning of its own.
  const relink = (ids) =>
    Array.isArray(ids)
      ? [...new Set(ids.map((id) => (oldNodes.has(id) ? remap.get(id) : id)).filter(Boolean))]
      : ids;
  const concepts = spec.concepts
    ? {
        ...spec.concepts,
        data: (spec.concepts.data || []).map((d) => ({ ...d, nodes: relink(d.nodes) })),
        stages: (spec.concepts.stages || []).map((s) => ({ ...s, nodes: relink(s.nodes) })),
      }
    : spec.concepts;

  const result = { ...spec, groups: merged, nodes, flows, concerns };
  if (concepts !== undefined) result.concepts = concepts;
  return { spec: result, dropped, replaced: remap.size };
}
