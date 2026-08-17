/**
 * Turning a diagram selection back into a prompt.
 *
 * The diagram is only half a conversation: you look at it, you spot the part
 * you care about, and the next thing you want is to *talk about that part*.
 * These helpers take the nodes you clicked plus a question and compose the
 * block of context that goes into the prompt box — so the agent gets the same
 * picture you are pointing at, not just a bare name.
 */

/** One-click questions. `id` doubles as the React key. */
export const ASK_ACTIONS = [
  {
    id: 'deeper',
    label: 'Go deeper',
    hint: 'Explain how this works in detail',
    question:
      'Go deeper on this: explain how it actually works — the control flow, the key decisions, and how it connects to the parts around it. Read the files before answering.',
  },
  {
    id: 'change',
    label: 'Change this',
    hint: 'Start a change request for this part',
    question:
      'I want to change this. Read the files first, then tell me what would have to change and where — and wait for my go-ahead before editing.',
  },
  {
    id: 'review',
    label: 'Review design',
    hint: 'Review code design and architecture',
    question:
      'Review the code design and architecture of this: responsibilities, coupling to its neighbours, naming, and anything that should be reorganised. Be concrete — quote file:line.',
  },
  {
    id: 'risks',
    label: 'Risks',
    hint: 'Failure modes and edge cases',
    question:
      'What are the failure modes and edge cases here? Point at the code that would break, and say which are worth fixing.',
  },
  {
    id: 'tests',
    label: 'Tests',
    hint: 'What is covered and what is missing',
    question:
      'What tests cover this today, and which are missing? List the cases worth adding, most valuable first.',
  },
];

const bullet = (label, value) => (value ? `${label}: ${value}` : null);

/**
 * Describe one node the way the diagram shows it — responsibility, what it
 * owns, where it lives, and the contracts on the arrows touching it.
 */
function describeNode(node, { edges, nodes, concerns }) {
  const inbound = edges.filter((e) => e.to === node.id);
  const outbound = edges.filter((e) => e.from === node.id);
  const nameOf = (id) => nodes.get(id)?.label || id;
  const contractLine = (edge, other) => {
    const contracts = edge.contracts.length ? ` — ${edge.contracts.join(' · ')}` : '';
    return `  ${other}${contracts}`;
  };
  const nodeConcerns = concerns.filter((c) => c.node === node.id);

  const traits = [node.kind, node.status, node.change !== 'untouched' ? node.change : null]
    .filter(Boolean)
    .join(', ');

  return [
    `### ${node.label}${traits ? ` (${traits})` : ''}`,
    bullet('Responsibility', node.responsibility),
    bullet('Owns', node.owns?.length ? node.owns.join(', ') : null),
    bullet('Files', node.files?.length ? node.files.join(', ') : null),
    inbound.length
      ? ['Receives from:', ...inbound.map((e) => contractLine(e, `← ${nameOf(e.from)}`))].join('\n')
      : null,
    outbound.length
      ? ['Sends to:', ...outbound.map((e) => contractLine(e, `→ ${nameOf(e.to)}`))].join('\n')
      : null,
    nodeConcerns.length
      ? ['Concerns:', ...nodeConcerns.map((c) => `  [${c.kind || 'note'}] ${c.text}`)].join('\n')
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Compose the prompt for a selection.
 *
 * @param {object} args
 * @param {object[]} args.selected  nodes clicked in the diagram, in click order
 * @param {string}   args.question  what to ask about them
 * @param {object}   args.spec      normalized spec (title, edges, nodes, concerns)
 * @returns {string} markdown ready to drop into the prompt box
 */
export function buildAskPrompt({ selected, question, spec }) {
  if (!selected?.length) return question || '';

  const ctx = { edges: spec.edges || [], nodes: spec.nodes || new Map(), concerns: spec.concerns || [] };
  const names = selected.map((n) => n.label).join(', ');
  const header =
    selected.length === 1
      ? `From the design diagram${spec.title ? ` of ${spec.title}` : ''} — the part I selected is **${names}**:`
      : `From the design diagram${spec.title ? ` of ${spec.title}` : ''} — the ${selected.length} parts I selected are **${names}**:`;

  return [header, '', selected.map((n) => describeNode(n, ctx)).join('\n\n'), '', question.trim()]
    .join('\n')
    .trim();
}

/** Existing files behind a selection, deduped — what to pull into the context. */
export function filesOfSelection(selected) {
  const seen = new Set();
  for (const node of selected) {
    const missing = new Set(node.filesMissing || []);
    for (const file of node.files || []) {
      if (!missing.has(file)) seen.add(file);
    }
  }
  return [...seen];
}
