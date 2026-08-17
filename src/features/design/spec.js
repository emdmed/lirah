/**
 * The design spec — the source of truth for a Design View diagram.
 *
 * A spec is plain JSON emitted by the extractor agent. Two properties are what
 * make it a *design* document rather than a box drawing:
 *
 *   - nodes carry `responsibility`, `owns` and `files`, so the diagram explains
 *     what each part does and where it lives;
 *   - flow steps carry `data`, so an arrow states the contract crossing it
 *     rather than just implying a connection.
 *
 * `flows` is also the only source of edges: the rendered graph is the union of
 * every flow's steps, which keeps structure and data flow from drifting apart.
 *
 * One spec feeds two diagrams:
 *
 *   - the **system** diagram — `layers`/`nodes`/`flows`, grounded in real files;
 *   - the **concepts** diagram — the optional `concepts` block, which names the
 *     data itself and the stages it moves through, in plain language and with no
 *     file paths, for a reader who has never seen the code.
 *
 * They are separate collections rather than two renderings of one, because they
 * answer different questions and abstract at different levels: a concepts stage
 * routinely covers several system nodes, and a piece of data routinely has no
 * single node that owns it. `concepts` is optional so that a spec written before
 * it existed still renders — see `conceptModel.js` for the derived fallback.
 */

/** Node kinds the renderer has a colour for. Unknown kinds fall back to `module`. */
export const NODE_KINDS = [
  'ui',
  'service',
  'store',
  'db',
  'queue',
  'external',
  'job',
  'module',
];

export const NODE_STATUSES = ['existing', 'proposed'];

/**
 * How this piece of work relates to a part: did it create it, change it, or
 * merely use it? Grounded in git during verification (see `paths_change_status`)
 * and only falls back to what the extractor claimed when git cannot say.
 */
export const NODE_CHANGES = ['added', 'modified', 'untouched'];

/** Beyond this the diagram stops being readable — the extractor is told to abstract. */
export const NODE_CAP = 40;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

/**
 * Validate a parsed spec.
 * @returns {{ ok: boolean, errors: Array<{path: string, message: string}>, warnings: string[] }}
 *   `errors` block rendering and drive the repair retry; `warnings` are shown
 *   but do not stop the diagram from being drawn.
 */
export function validateSpec(spec) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: [{ path: '', message: 'spec must be a JSON object' }], warnings };
  }

  if (!isNonEmptyString(spec.title)) err('title', 'must be a non-empty string');
  if (spec.summary !== undefined && typeof spec.summary !== 'string') {
    err('summary', 'must be a string when present');
  }

  // --- layers ---
  const layerIds = new Set();
  if (!Array.isArray(spec.layers) || spec.layers.length === 0) {
    err('layers', 'must be a non-empty array');
  } else {
    spec.layers.forEach((layer, i) => {
      const at = `layers[${i}]`;
      if (!layer || typeof layer !== 'object') {
        err(at, 'must be an object');
        return;
      }
      if (!isNonEmptyString(layer.id)) err(`${at}.id`, 'must be a non-empty string');
      else if (layerIds.has(layer.id)) err(`${at}.id`, `duplicate layer id "${layer.id}"`);
      else layerIds.add(layer.id);
      if (!isNonEmptyString(layer.label)) err(`${at}.label`, 'must be a non-empty string');
      if (layer.order !== undefined && typeof layer.order !== 'number') {
        err(`${at}.order`, 'must be a number when present');
      }
    });
  }

  // --- nodes ---
  const nodeIds = new Set();
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    err('nodes', 'must be a non-empty array');
  } else {
    spec.nodes.forEach((node, i) => {
      const at = `nodes[${i}]`;
      if (!node || typeof node !== 'object') {
        err(at, 'must be an object');
        return;
      }
      if (!isNonEmptyString(node.id)) err(`${at}.id`, 'must be a non-empty string');
      else if (nodeIds.has(node.id)) err(`${at}.id`, `duplicate node id "${node.id}"`);
      else nodeIds.add(node.id);
      if (!isNonEmptyString(node.label)) err(`${at}.label`, 'must be a non-empty string');
      if (!isNonEmptyString(node.layer)) {
        err(`${at}.layer`, 'must be a non-empty string');
      } else if (layerIds.size > 0 && !layerIds.has(node.layer)) {
        err(`${at}.layer`, `"${node.layer}" is not a declared layer id`);
      }
      if (!isNonEmptyString(node.responsibility)) {
        err(`${at}.responsibility`, 'must be a non-empty string — one sentence on what this does');
      }
      if (node.status !== undefined && !NODE_STATUSES.includes(node.status)) {
        err(`${at}.status`, `must be one of ${NODE_STATUSES.join(' | ')}`);
      }
      if (node.change !== undefined && !NODE_CHANGES.includes(node.change)) {
        err(`${at}.change`, `must be one of ${NODE_CHANGES.join(' | ')}`);
      }
      if (node.owns !== undefined && !isStringArray(node.owns)) {
        err(`${at}.owns`, 'must be an array of strings when present');
      }
      if (node.files !== undefined && !isStringArray(node.files)) {
        err(`${at}.files`, 'must be an array of strings when present');
      }
      if (node.kind !== undefined && !isNonEmptyString(node.kind)) {
        err(`${at}.kind`, 'must be a non-empty string when present');
      }
      // Free-form on purpose: the renderer has icons and tags for the sub-kinds
      // it knows (see designIcons.jsx) and falls back to showing anything else
      // verbatim, so an unmodelled one is information rather than an error.
      if (node.subkind !== undefined && !isNonEmptyString(node.subkind)) {
        err(`${at}.subkind`, 'must be a non-empty string when present');
      }
    });
    if (spec.nodes.length > NODE_CAP) {
      warnings.push(
        `${spec.nodes.length} nodes exceeds the ${NODE_CAP}-node budget — the diagram may be hard to read.`
      );
    }
  }

  // --- flows ---
  if (spec.flows !== undefined && !Array.isArray(spec.flows)) {
    err('flows', 'must be an array when present');
  } else if (Array.isArray(spec.flows)) {
    spec.flows.forEach((flow, i) => {
      const at = `flows[${i}]`;
      if (!flow || typeof flow !== 'object') {
        err(at, 'must be an object');
        return;
      }
      if (!isNonEmptyString(flow.label)) err(`${at}.label`, 'must be a non-empty string');
      if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
        err(`${at}.steps`, 'must be a non-empty array');
        return;
      }
      flow.steps.forEach((step, j) => {
        const sat = `${at}.steps[${j}]`;
        if (!step || typeof step !== 'object') {
          err(sat, 'must be an object');
          return;
        }
        for (const end of ['from', 'to']) {
          if (!isNonEmptyString(step[end])) {
            err(`${sat}.${end}`, 'must be a non-empty string');
          } else if (nodeIds.size > 0 && !nodeIds.has(step[end])) {
            err(`${sat}.${end}`, `"${step[end]}" is not a declared node id`);
          }
        }
        if (step.data !== undefined && typeof step.data !== 'string') {
          err(`${sat}.data`, 'must be a string when present');
        }
      });
    });
    if (spec.flows.length === 0) {
      warnings.push('No flows declared — the diagram will have no arrows and no data contracts.');
    }
  }

  // --- concepts ---
  //
  // The second diagram. Optional, because a spec produced before this existed is
  // still a perfectly good system diagram — the concepts view falls back to
  // deriving what it can (see `conceptModel.js`) rather than refusing to draw.
  if (spec.concepts !== undefined) {
    if (!spec.concepts || typeof spec.concepts !== 'object' || Array.isArray(spec.concepts)) {
      err('concepts', 'must be an object when present');
    } else {
      const { summary, data, stages } = spec.concepts;
      if (summary !== undefined && typeof summary !== 'string') {
        err('concepts.summary', 'must be a string when present');
      }

      const dataIds = new Set();
      if (!Array.isArray(data) || data.length === 0) {
        err('concepts.data', 'must be a non-empty array — the concepts view is about the data');
      } else {
        data.forEach((item, i) => {
          const at = `concepts.data[${i}]`;
          if (!item || typeof item !== 'object') {
            err(at, 'must be an object');
            return;
          }
          if (!isNonEmptyString(item.id)) err(`${at}.id`, 'must be a non-empty string');
          else if (dataIds.has(item.id)) err(`${at}.id`, `duplicate data id "${item.id}"`);
          else dataIds.add(item.id);
          if (!isNonEmptyString(item.label)) err(`${at}.label`, 'must be a non-empty string');
          // `shape` and `what` are the two halves of "what this data is". A data
          // item missing either is a name with nothing behind it, which is
          // exactly what this view exists to avoid.
          if (!isNonEmptyString(item.shape)) {
            err(`${at}.shape`, 'must be a non-empty string — the concrete shape of this data');
          }
          if (!isNonEmptyString(item.what)) {
            err(`${at}.what`, 'must be a non-empty string — one sentence on what this data is');
          }
          if (item.nodes !== undefined && !isStringArray(item.nodes)) {
            err(`${at}.nodes`, 'must be an array of strings when present');
          }
        });
      }

      const stageIds = new Set();
      if (!Array.isArray(stages) || stages.length === 0) {
        err('concepts.stages', 'must be a non-empty array');
      } else {
        stages.forEach((stage, i) => {
          const at = `concepts.stages[${i}]`;
          if (!stage || typeof stage !== 'object') {
            err(at, 'must be an object');
            return;
          }
          if (!isNonEmptyString(stage.id)) err(`${at}.id`, 'must be a non-empty string');
          else if (stageIds.has(stage.id)) err(`${at}.id`, `duplicate stage id "${stage.id}"`);
          else stageIds.add(stage.id);
          if (!isNonEmptyString(stage.label)) err(`${at}.label`, 'must be a non-empty string');
          if (!isNonEmptyString(stage.does)) {
            err(`${at}.does`, 'must be a non-empty string — one plain sentence on what happens here');
          }
          if (stage.actor !== undefined && !isNonEmptyString(stage.actor)) {
            err(`${at}.actor`, 'must be a non-empty string when present');
          }
          for (const end of ['consumes', 'produces']) {
            if (stage[end] === undefined) continue;
            if (!isStringArray(stage[end])) {
              err(`${at}.${end}`, 'must be an array of strings when present');
              continue;
            }
            for (const id of stage[end]) {
              if (dataIds.size > 0 && !dataIds.has(id)) {
                err(`${at}.${end}`, `"${id}" is not a declared concepts.data id`);
              }
            }
          }
          // The link back to the system diagram. Wrong ids here would break the
          // "show these parts" jump, so they are checked like any other edge.
          if (stage.nodes !== undefined) {
            if (!isStringArray(stage.nodes)) {
              err(`${at}.nodes`, 'must be an array of strings when present');
            } else {
              for (const id of stage.nodes) {
                if (nodeIds.size > 0 && !nodeIds.has(id)) {
                  err(`${at}.nodes`, `"${id}" is not a declared node id`);
                }
              }
            }
          }
        });

        // Data nobody reads or writes is either a missing wire or a leftover;
        // either way the reader is owed the diagram's own admission of it.
        const wired = new Set();
        for (const stage of stages) {
          for (const id of [...(stage?.consumes || []), ...(stage?.produces || [])]) wired.add(id);
        }
        const orphans = [...dataIds].filter((id) => !wired.has(id));
        if (orphans.length) {
          warnings.push(
            `concepts.data ${orphans.map((id) => `"${id}"`).join(', ')} ${
              orphans.length === 1 ? 'is' : 'are'
            } never consumed or produced by a stage — it will not appear on the flow.`
          );
        }
      }
    }
  } else {
    warnings.push(
      'No concepts block — the concepts view will be derived from the system diagram. Regenerate for the plain-language version.'
    );
  }

  // --- concerns ---
  if (spec.concerns !== undefined && !Array.isArray(spec.concerns)) {
    err('concerns', 'must be an array when present');
  } else if (Array.isArray(spec.concerns)) {
    spec.concerns.forEach((c, i) => {
      const at = `concerns[${i}]`;
      if (!c || typeof c !== 'object') {
        err(at, 'must be an object');
        return;
      }
      if (!isNonEmptyString(c.text)) err(`${at}.text`, 'must be a non-empty string');
      if (c.node !== undefined && nodeIds.size > 0 && !nodeIds.has(c.node)) {
        err(`${at}.node`, `"${c.node}" is not a declared node id`);
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Fill in defaults and derive the render model from a validated spec.
 *
 * Returns `{ title, summary, layers, nodes, edges, flows, concerns }` where
 * `layers` is ordered, `nodes` is a Map keyed by id, and `edges` is the deduped
 * union of every flow step (each edge remembering which flows it belongs to and
 * the data contracts declared on it).
 */
export function normalizeSpec(spec) {
  const layers = [...(spec.layers || [])]
    .map((l, i) => ({ ...l, order: typeof l.order === 'number' ? l.order : i }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const nodes = new Map();
  for (const node of spec.nodes || []) {
    const status = NODE_STATUSES.includes(node.status) ? node.status : 'existing';
    nodes.set(node.id, {
      ...node,
      kind: NODE_KINDS.includes(node.kind) ? node.kind : 'module',
      subkind: typeof node.subkind === 'string' ? node.subkind.trim().toLowerCase() : '',
      status,
      // Nothing said either way: a part that does not exist yet is by
      // definition something this work adds; anything else is assumed to be
      // pre-existing until git says otherwise.
      change: NODE_CHANGES.includes(node.change)
        ? node.change
        : status === 'proposed'
          ? 'added'
          : 'untouched',
      owns: node.owns || [],
      files: node.files || [],
      detail: node.detail || '',
    });
  }

  const flows = (spec.flows || []).map((flow, i) => ({
    ...flow,
    id: flow.id || `flow-${i}`,
    steps: flow.steps || [],
  }));

  // Union of all flow steps. Two flows crossing the same pair of nodes share one
  // edge; their contracts are collected so the arrow can label all of them.
  const edges = new Map();
  for (const flow of flows) {
    flow.steps.forEach((step, index) => {
      if (!nodes.has(step.from) || !nodes.has(step.to)) return;
      const key = `${step.from}->${step.to}`;
      if (!edges.has(key)) {
        edges.set(key, { key, from: step.from, to: step.to, contracts: [], flows: [] });
      }
      const edge = edges.get(key);
      if (step.data && !edge.contracts.includes(step.data)) edge.contracts.push(step.data);
      edge.flows.push({ flowId: flow.id, flowLabel: flow.label, index, note: step.note || '' });
    });
  }

  const concerns = spec.concerns || [];

  return {
    title: spec.title,
    summary: spec.summary || '',
    layers,
    nodes,
    edges: [...edges.values()],
    flows,
    concerns,
    // Passed through raw on purpose: turning it into the concepts render model
    // needs the *normalized* nodes and edges (to derive a fallback when the block
    // is absent), so that job belongs to `buildConceptModel`, not here.
    concepts: spec.concepts || null,
  };
}

/**
 * Extract a JSON object from agent output that may be wrapped in prose or a
 * fenced code block. Returns the parsed value or throws with a useful message.
 */
export function parseSpecJson(text) {
  if (!text || !text.trim()) throw new Error('Extractor produced no output');
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const candidates = [fenced?.[1], trimmed];

  // Last resort: the outermost brace pair in the output.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  let lastError = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Output was not valid JSON: ${lastError?.message || 'unknown parse error'}`);
}
