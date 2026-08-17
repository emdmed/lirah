/**
 * Icons and sub-kind tags for the design diagram.
 *
 * A box's colour already says what *kind* of thing it is, but colour alone is a
 * slow read (and a dead one for a colourblind reader or a screenshot). An icon
 * plus a word is instant: you can tell a table from a view from a stored
 * procedure without opening the side panel.
 *
 * Two levels:
 *   - `kind` — the coarse class the layout and palette already use (`db`, `ui`…);
 *   - `subkind` — what it actually is within that class (`table`, `view`,
 *     `proc`…). It comes off the spec when the extractor knows it, and is
 *     inferred from the label and file paths when it does not.
 */

import {
  Archive,
  Bell,
  Boxes,
  Braces,
  Clock,
  Cog,
  Component,
  Database,
  Eye,
  FileCode,
  GitBranch,
  Globe,
  HardDrive,
  Inbox,
  KeyRound,
  Layers,
  ListChecks,
  Monitor,
  Network,
  Package,
  PanelTop,
  Route,
  Send,
  Server,
  Settings,
  SquareFunction,
  Table2,
  Terminal,
  TestTube,
  Timer,
  Webhook,
  Zap,
} from 'lucide-react';

/** One icon per node kind — the fallback when no sub-kind is known. */
export const KIND_ICON = {
  ui: Monitor,
  service: Server,
  store: Archive,
  db: Database,
  queue: Inbox,
  external: Globe,
  job: Timer,
  module: Package,
};

/** Short uppercase tag drawn in the node header, per kind. */
export const KIND_TAG = {
  ui: 'UI',
  service: 'SVC',
  store: 'STORE',
  db: 'DB',
  queue: 'QUEUE',
  external: 'EXT',
  job: 'JOB',
  module: 'MOD',
};

/**
 * Known sub-kinds. `tag` is what the box shows instead of the kind tag, so it
 * stays short enough to fit beside a label.
 */
export const SUBKIND_META = {
  // database
  table: { icon: Table2, tag: 'TABLE', label: 'table' },
  view: { icon: Eye, tag: 'VIEW', label: 'view' },
  proc: { icon: SquareFunction, tag: 'PROC', label: 'stored procedure' },
  function: { icon: SquareFunction, tag: 'FN', label: 'function' },
  index: { icon: KeyRound, tag: 'INDEX', label: 'index' },
  trigger: { icon: Zap, tag: 'TRIG', label: 'trigger' },
  migration: { icon: GitBranch, tag: 'MIGR', label: 'migration' },
  schema: { icon: Layers, tag: 'SCHEMA', label: 'schema' },
  // service / api
  endpoint: { icon: Route, tag: 'API', label: 'HTTP endpoint' },
  controller: { icon: Network, tag: 'CTRL', label: 'controller' },
  middleware: { icon: Layers, tag: 'MW', label: 'middleware' },
  worker: { icon: Cog, tag: 'WORKER', label: 'worker' },
  cron: { icon: Clock, tag: 'CRON', label: 'scheduled job' },
  cli: { icon: Terminal, tag: 'CLI', label: 'CLI command' },
  // ui
  page: { icon: PanelTop, tag: 'PAGE', label: 'page' },
  component: { icon: Component, tag: 'CMP', label: 'component' },
  hook: { icon: Webhook, tag: 'HOOK', label: 'hook' },
  // data movement / plumbing
  cache: { icon: Zap, tag: 'CACHE', label: 'cache' },
  topic: { icon: Send, tag: 'TOPIC', label: 'topic' },
  event: { icon: Bell, tag: 'EVENT', label: 'event' },
  file: { icon: FileCode, tag: 'FILE', label: 'file' },
  storage: { icon: HardDrive, tag: 'BLOB', label: 'object storage' },
  config: { icon: Settings, tag: 'CONFIG', label: 'configuration' },
  type: { icon: Braces, tag: 'TYPE', label: 'type/contract' },
  test: { icon: TestTube, tag: 'TEST', label: 'test' },
  list: { icon: ListChecks, tag: 'LIST', label: 'list' },
};

export const NODE_SUBKINDS = Object.keys(SUBKIND_META);

/**
 * Patterns that give a database part away by name. Ordered — the first match
 * wins, so the more specific prefixes come before the generic words.
 */
const DB_HINTS = [
  [/\b(usp|sp|prc)[_-]|\bstored\s*proc|\bprocedure\b|\bproc\b/i, 'proc'],
  [/\b(vw|v)[_-]|\bviews?\b/i, 'view'],
  [/\b(tbl|dim|fact)[_-]|\btables?\b/i, 'table'],
  [/\bmigrations?\b|\bmigrate\b/i, 'migration'],
  [/\btriggers?\b/i, 'trigger'],
  [/\bindexe?s?\b/i, 'index'],
  [/\bfunctions?\b|\bfn[_-]|\budf\b/i, 'function'],
];

/**
 * The sub-kind for a node: what the spec declared if it is one we know, else a
 * guess from the label and file paths.
 *
 * @returns {string|null} a key of `SUBKIND_META`, or null when nothing applies.
 */
export function resolveSubkind(node) {
  if (!node) return null;
  const declared = typeof node.subkind === 'string' ? node.subkind.trim().toLowerCase() : '';
  if (SUBKIND_META[declared]) return declared;

  // Inference is limited to database parts on purpose: that is where the
  // distinction changes how you read the box, and where names are reliable.
  if (node.kind !== 'db') return null;
  const haystack = `${node.label || ''} ${(node.files || []).join(' ')} ${node.responsibility || ''}`;
  for (const [pattern, subkind] of DB_HINTS) {
    if (pattern.test(haystack)) return subkind;
  }
  return null;
}

/** The icon component to draw for a node. */
export function iconFor(node) {
  const subkind = resolveSubkind(node);
  if (subkind) return SUBKIND_META[subkind].icon;
  return KIND_ICON[node?.kind] || KIND_ICON.module;
}

/**
 * The header tag for a node: the sub-kind when we have one ("VIEW"), otherwise
 * the kind ("DB"). An unrecognised sub-kind still gets shown — the extractor
 * knowing something we did not model is better information than nothing.
 */
export function tagFor(node) {
  const subkind = resolveSubkind(node);
  if (subkind) return SUBKIND_META[subkind].tag;
  const declared = typeof node?.subkind === 'string' ? node.subkind.trim() : '';
  if (declared) return declared.slice(0, 7).toUpperCase();
  return KIND_TAG[node?.kind] || KIND_TAG.module;
}

/** Human phrase for the side panel: "db · view", or just "db". */
export function typeLabel(node) {
  const subkind = resolveSubkind(node);
  const declared = typeof node?.subkind === 'string' ? node.subkind.trim() : '';
  const detail = subkind ? SUBKIND_META[subkind].label : declared;
  return detail ? `${node.kind} · ${detail}` : node?.kind || 'module';
}

/** Layer labels that name their contents outright — trusted over the contents. */
const LAYER_HINTS = [
  [/\b(database|db|sql|persistence|storage|data\s*store)\b/i, Database],
  [/\b(ui|frontend|front-end|client|view|presentation|web)\b/i, Monitor],
  [/\b(api|backend|back-end|server|service|core|domain)\b/i, Server],
  [/\b(queue|bus|broker|messaging|events?)\b/i, Inbox],
  [/\b(external|third[\s-]party|vendor|integration)\b/i, Globe],
  [/\b(jobs?|worker|scheduler|cron|background)\b/i, Timer],
  [/\b(filesystem|files?|disk)\b/i, HardDrive],
];

/**
 * Icon for a layer band. The label wins when it names what the band holds;
 * otherwise the band takes the icon of the kind most of its nodes are.
 */
export function iconForLayer(label, bandNodes = []) {
  for (const [pattern, Icon] of LAYER_HINTS) {
    if (pattern.test(label || '')) return Icon;
  }
  const counts = new Map();
  for (const node of bandNodes) {
    const key = node?.kind || 'module';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return KIND_ICON[best] || Boxes;
}
