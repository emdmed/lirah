/**
 * The render model for the concepts diagram.
 *
 * The system diagram answers "what are the parts and where do they live". This
 * one answers the question a newcomer actually asks first: **what data is moving
 * through here, what is in it, and who hands it to whom.** So its nodes are
 * stages of a flow rather than modules, and the data is a first-class citizen
 * with a name, a shape and a definition — not a label on an arrow.
 *
 * Two ways to get one:
 *
 *   - the extractor wrote a `concepts` block — the good case, because only the
 *     agent can write the plain-language sentences that make this view fast to
 *     read;
 *   - it did not, because the spec predates this view — then a skeleton is
 *     *derived* from the system diagram. A derived model is honest about being
 *     derived and never invents prose: it uses the layers as stages and the arrow
 *     contracts as data, and leaves the sentences empty rather than guessing.
 */

/** Rough classes for a data item, from its declared shape. Drives icon + tint. */
export const DATA_FORMS = ['object', 'text', 'file', 'event', 'row', 'stream', 'value'];

/**
 * Guess the form of a data item from the words used to describe its shape. The
 * extractor is not asked for this — it is a rendering hint, and a wrong guess
 * costs a tint, so inferring beats another required field.
 */
export function formOf(shape = '', label = '') {
  const s = `${shape} ${label}`.toLowerCase();
  if (/\bfile\b|\.json|\.md|\.log|\.jsonl|path|directory|on disk/.test(s)) return 'file';
  if (/event|emitted|signal|notification|ndjson stream|stream-json/.test(s)) return 'event';
  if (/stream|chunk|ndjson/.test(s)) return 'stream';
  if (/\brow\b|\btable\b|record|sql/.test(s)) return 'row';
  if (/\{|\bobject\b|json|struct|dto|payload|spec\b/.test(s)) return 'object';
  if (/markdown|text|string|prose|transcript|digest/.test(s)) return 'text';
  return 'value';
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/**
 * Build the concepts model for a normalized spec.
 *
 * @param {object} spec normalized spec (from `normalizeSpec`)
 * @returns {{
 *   summary: string,
 *   derived: boolean,
 *   data: Array<object>,
 *   dataById: Map<string, object>,
 *   stages: Array<object>,
 *   ok: boolean,
 * }}
 *   `ok` is false only when there is nothing to draw at all — no concepts block
 *   and a system diagram too thin to derive one from.
 */
export function buildConceptModel(spec) {
  if (!spec) return empty();
  return spec.concepts ? fromBlock(spec) : derive(spec);
}

function empty() {
  return { summary: '', derived: false, data: [], dataById: new Map(), stages: [], ok: false };
}

/** Attach the cross-references both directions so either side can be clicked. */
function link({ summary, derived, data, stages, spec }) {
  const dataById = new Map(data.map((d) => [d.id, d]));

  // Which stages touch each datum, and in which direction. Computed once here so
  // neither the flow nor the dictionary has to scan the stage list per row.
  for (const datum of data) {
    datum.producedBy = [];
    datum.consumedBy = [];
  }
  for (const stage of stages) {
    stage.consumesData = stage.consumes.map((id) => dataById.get(id)).filter(Boolean);
    stage.producesData = stage.produces.map((id) => dataById.get(id)).filter(Boolean);
    for (const datum of stage.producesData) datum.producedBy.push(stage);
    for (const datum of stage.consumesData) datum.consumedBy.push(stage);
    // The jump into the system diagram. Only ids that really exist there survive,
    // so a stale reference degrades to "no parts" rather than a dead button.
    stage.systemNodes = stage.nodes.filter((id) => spec.nodes.has(id));
  }

  // What crosses from one stage to the next: the data this stage produces that
  // the following one consumes. This is the arrow's payload, and the reason the
  // view can label its connectors with real content instead of a bare chevron.
  stages.forEach((stage, i) => {
    const next = stages[i + 1];
    stage.handoff = next
      ? stage.producesData.filter((d) => next.consumes.includes(d.id))
      : [];
    // Produced here and consumed somewhere other than the next stage — a real
    // part of the design, and invisible if the view only drew the chain.
    stage.branchOut = stage.producesData.filter(
      (d) => !stage.handoff.includes(d) && d.consumedBy.some((s) => s !== stage)
    );
    stage.terminal = stage.producesData.filter((d) => d.consumedBy.length === 0);
  });

  return { summary, derived, data, dataById, stages, ok: stages.length > 0 && data.length > 0 };
}

/** The good case: the extractor wrote the block. */
function fromBlock(spec) {
  const block = spec.concepts;

  const data = arr0(block.data).map((d) => ({
    id: str(d.id),
    label: str(d.label),
    shape: str(d.shape),
    what: str(d.what),
    livesIn: str(d.livesIn),
    example: str(d.example),
    nodes: arr(d.nodes).filter((id) => spec.nodes.has(id)),
    form: formOf(str(d.shape), str(d.label)),
  }));

  const stages = arr0(block.stages).map((s, i) => ({
    id: str(s.id) || `stage-${i}`,
    index: i,
    label: str(s.label),
    does: str(s.does),
    actor: str(s.actor),
    consumes: arr(s.consumes),
    produces: arr(s.produces),
    nodes: arr(s.nodes),
  }));

  return link({ summary: str(block.summary) || spec.summary, derived: false, data, stages, spec });
}

const arr0 = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

/**
 * The fallback: no concepts block, so build a skeleton from the system diagram.
 *
 * Layers become the stages (they are already an ordered top-to-bottom pipeline)
 * and the contracts on cross-layer arrows become the data. Deliberately no
 * invented sentences — `does` and `what` stay empty and the view says so, because
 * a plausible-sounding fabricated explanation is worse than a visible gap in a
 * document whose whole job is explaining a system to someone who cannot yet check
 * it.
 */
function derive(spec) {
  const layerOf = (id) => spec.nodes.get(id)?.layer;

  const stages = spec.layers.map((layer, i) => {
    const members = [...spec.nodes.values()].filter((n) => n.layer === layer.id);
    return {
      id: layer.id,
      index: i,
      label: layer.label,
      does: '',
      actor: '',
      consumes: [],
      produces: [],
      nodes: members.map((n) => n.id),
    };
  });
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // One datum per distinct contract. Two arrows carrying the same contract are
  // the same data, which is precisely the insight the system diagram cannot show.
  const data = [];
  const byContract = new Map();
  for (const edge of spec.edges) {
    const fromLayer = layerOf(edge.from);
    const toLayer = layerOf(edge.to);
    for (const contract of edge.contracts) {
      const key = contract.trim();
      if (!key) continue;
      let datum = byContract.get(key);
      if (!datum) {
        datum = {
          id: `contract-${byContract.size}`,
          label: key,
          shape: key,
          what: '',
          livesIn: '',
          example: '',
          nodes: [],
          form: formOf(key, key),
        };
        byContract.set(key, datum);
        data.push(datum);
      }
      for (const nodeId of [edge.from, edge.to]) {
        if (!datum.nodes.includes(nodeId)) datum.nodes.push(nodeId);
      }
      const producer = stageById.get(fromLayer);
      const consumer = stageById.get(toLayer);
      if (producer && !producer.produces.includes(datum.id)) producer.produces.push(datum.id);
      if (consumer && !consumer.consumes.includes(datum.id)) consumer.consumes.push(datum.id);
    }
  }

  return link({ summary: spec.summary, derived: true, data, stages, spec });
}
