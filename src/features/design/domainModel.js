/**
 * The domains render model: the spec's `groups` tree, with every node filed
 * under it and every node-level arrow rolled up into an arrow between groups.
 *
 * The domains view answers "what are the big areas of this system and how do
 * they talk?", one level at a time — the domains, then the features inside one
 * domain. None of its arrows are declared by the extractor: they are derived
 * here from the same flow steps that draw the system diagram, so the two views
 * can never disagree about what is connected to what.
 *
 * Two levels, fixed: a domain may hold features, a feature holds only nodes.
 * A domain that has features *and* nodes filed directly under it gets a
 * synthetic "core" feature for those nodes, so nothing is ever invisible at the
 * feature level.
 *
 * A spec written before groups existed still gets a domains view: one domain
 * per layer, flagged `derived` so the UI can say it is a stand-in.
 */

const CORE_SUFFIX = '::core';

// Mirrors `changeOf` in DesignNode.jsx; kept local so this module stays free of
// React and theme imports and can be checked with plain node.
const CHANGES = ['added', 'modified', 'untouched'];
const changeOf = (node) => (CHANGES.includes(node?.change) ? node.change : 'untouched');

const emptyCounts = () => ({ added: 0, modified: 0, untouched: 0, proposed: 0 });

function makeGroup({ id, label, purpose = '', parent = null, synthetic = false, expanded = false }) {
  return {
    id,
    label,
    purpose,
    parent,
    synthetic,
    expanded,
    children: [],
    /** Every node in this group or any group under it. */
    nodeIds: [],
    counts: emptyCounts(),
  };
}

/**
 * @param {ReturnType<import('./spec').normalizeSpec> | null} spec
 * @returns {{
 *   ok: boolean,
 *   derived: boolean,
 *   groups: Map<string, ReturnType<typeof makeGroup>>,
 *   domains: string[],
 *   domainOf: Map<string, string>,
 *   featureOf: Map<string, string>,
 * }}
 */
export function buildDomainModel(spec) {
  const groups = new Map();
  const domains = [];
  const domainOf = new Map();
  const featureOf = new Map();
  const empty = { ok: false, derived: false, groups, domains, domainOf, featureOf };
  if (!spec || !spec.nodes || spec.nodes.size === 0) return empty;

  const declared = spec.groups || [];
  const derived = declared.length === 0;

  if (derived) {
    for (const layer of spec.layers || []) {
      const id = `layer:${layer.id}`;
      groups.set(id, makeGroup({ id, label: layer.label, purpose: '' }));
      domains.push(id);
    }
  } else {
    for (const g of declared) {
      if (!g.parent) {
        groups.set(g.id, makeGroup(g));
        domains.push(g.id);
      }
    }
    for (const g of declared) {
      if (!g.parent || !groups.has(g.parent)) continue;
      groups.set(g.id, makeGroup(g));
      groups.get(g.parent).children.push(g.id);
    }
  }

  // File every node. A node pointing at something unknown (only possible for a
  // spec that skipped validation) is dropped from this view rather than crashing.
  const directOf = new Map();
  for (const node of spec.nodes.values()) {
    const gid = derived ? `layer:${node.layer}` : node.group;
    const group = groups.get(gid);
    if (!group) continue;
    const domainId = group.parent || group.id;
    domainOf.set(node.id, domainId);
    if (group.parent) {
      featureOf.set(node.id, group.id);
    } else if (group.children.length > 0) {
      if (!directOf.has(domainId)) directOf.set(domainId, []);
      directOf.get(domainId).push(node.id);
    }
  }

  // Nodes filed straight under a domain that also has features get a feature of
  // their own; otherwise they would vanish one level down.
  for (const [domainId, ids] of directOf) {
    const domain = groups.get(domainId);
    const coreId = `${domainId}${CORE_SUFFIX}`;
    groups.set(
      coreId,
      makeGroup({
        id: coreId,
        label: `${domain.label} · core`,
        purpose: `Parts that belong to ${domain.label} as a whole rather than to one of its features.`,
        parent: domainId,
        synthetic: true,
      })
    );
    domain.children.push(coreId);
    for (const id of ids) featureOf.set(id, coreId);
  }

  for (const node of spec.nodes.values()) {
    const domainId = domainOf.get(node.id);
    if (!domainId) continue;
    const touched = [groups.get(domainId)];
    const featureId = featureOf.get(node.id);
    if (featureId) touched.push(groups.get(featureId));
    for (const group of touched) {
      group.nodeIds.push(node.id);
      group.counts[changeOf(node)] += 1;
      if (node.status === 'proposed') group.counts.proposed += 1;
    }
  }

  return { ok: domains.length > 0, derived, groups, domains, domainOf, featureOf };
}

/**
 * Collapse node-level edges onto boxes. `boxOf` maps a node id to the box it
 * is drawn inside at this level, or `undefined` to leave the node out.
 *
 * Each resulting arrow remembers how many node-level arrows it stands for, the
 * contracts they carry and the flows they belong to — the label and the side
 * panel are built from exactly those, so a rolled-up arrow is never vaguer than
 * the arrows under it.
 */
export function rollUpEdges(edges, boxOf) {
  const out = new Map();
  for (const edge of edges || []) {
    const from = boxOf(edge.from);
    const to = boxOf(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    if (!out.has(key)) {
      out.set(key, { key, from, to, count: 0, contracts: [], flows: [], pairs: [] });
    }
    const agg = out.get(key);
    agg.count += 1;
    agg.pairs.push({ from: edge.from, to: edge.to });
    for (const c of edge.contracts || []) if (!agg.contracts.includes(c)) agg.contracts.push(c);
    for (const f of edge.flows || []) {
      if (!agg.flows.includes(f.flowLabel)) agg.flows.push(f.flowLabel);
    }
  }
  return [...out.values()];
}

/**
 * The boxes and arrows for one level of the drill-down.
 *
 * `scope` null is the top: one box per domain. `scope` a domain id is that
 * domain's features, plus a stub box for every *other* domain they exchange
 * data with — a feature's neighbours outside its domain are half of what it is
 * for, and leaving them off would draw it as an island.
 *
 * @returns {{ scope: string|null, boxes: Array<{ id: string, external: boolean }>, edges: ReturnType<typeof rollUpEdges> }}
 */
export function levelOf(model, edges, scope = null) {
  if (!model?.ok) return { scope, boxes: [], edges: [] };

  if (!scope) {
    return {
      scope,
      boxes: model.domains.map((id) => ({ id, external: false })),
      edges: rollUpEdges(edges, (n) => model.domainOf.get(n)),
    };
  }

  const domain = model.groups.get(scope);
  if (!domain) return { scope, boxes: [], edges: [] };

  const inside = (n) => model.domainOf.get(n) === scope;
  const rolled = rollUpEdges(edges, (n) =>
    inside(n) ? model.featureOf.get(n) : model.domainOf.get(n)
  ).filter((e) => {
    const fromIn = model.groups.get(e.from)?.parent === scope;
    const toIn = model.groups.get(e.to)?.parent === scope;
    return fromIn || toIn;
  });

  const externals = [];
  for (const e of rolled) {
    for (const id of [e.from, e.to]) {
      if (model.groups.get(id)?.parent !== scope && !externals.includes(id)) externals.push(id);
    }
  }
  // Externals keep the top level's order, so a neighbour sits in the same
  // relative place every time you drill into a different domain.
  externals.sort((a, b) => model.domains.indexOf(a) - model.domains.indexOf(b));

  return {
    scope,
    boxes: [
      ...domain.children.map((id) => ({ id, external: false })),
      ...externals.map((id) => ({ id, external: true })),
    ],
    edges: rolled,
  };
}

/** True when a box can be opened one level further inside the domains view. */
export const hasChildren = (model, id) => (model?.groups.get(id)?.children.length || 0) > 0;
