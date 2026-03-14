// Layout constants
export const NODE_H_COLLAPSED = 28;
export const NODE_LINE_H = 16;
export const NODE_PAD_X = 12;
export const NODE_PAD_Y = 6;
export const NODE_MIN_W = 100;
const GROUP_PAD = 12;
const GROUP_HEADER = 22;
const GROUP_GAP_X = 40;
const GROUP_GAP_Y = 12;
const NODE_GAP = 8;
export const CHAR_W = 7.2;

export function measureText(str) {
  return str.length * CHAR_W;
}

const COL_THRESHOLD = 5;

/**
 * Expand a signature like "Foo({ a, b, c, d, e, f })" into multiple labels
 * when params exceed COL_THRESHOLD: "Foo({", "  a, b,", "  c, d,", ... "})"
 * Returns array of label strings.
 */
function expandSignature(sig) {
  const trimmed = sig.replace(/[*!+]$/, '');
  if (!trimmed.endsWith(')')) return [sig];
  let depth = 0;
  let lastOpenIdx = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === ')') depth++;
    else if (trimmed[i] === '(') { depth--; if (depth === 0) { lastOpenIdx = i; break; } }
  }
  if (lastOpenIdx <= 0) return [sig];
  const prefix = trimmed.slice(0, lastOpenIdx);
  let inner = trimmed.slice(lastOpenIdx + 1, trimmed.length - 1).trim();
  if (!inner) return [sig];
  const hasBraces = inner.startsWith('{') && inner.endsWith('}');
  if (hasBraces) inner = inner.slice(1, -1).trim();
  const params = inner.split(',').map(p => p.trim()).filter(Boolean);
  if (params.length <= COL_THRESHOLD) return [sig];
  const open = hasBraces ? '({' : '(';
  const close = hasBraces ? '})' : ')';
  const WRAP_SIZE = Math.min(3, Math.ceil(params.length / Math.ceil(params.length / 3)));
  const lines = [`${prefix}${open}`];
  for (let i = 0; i < params.length; i += WRAP_SIZE) {
    const chunk = params.slice(i, i + WRAP_SIZE);
    const trailing = i + WRAP_SIZE < params.length ? ',' : '';
    lines.push(`  ${chunk.join(', ')}${trailing}`);
  }
  lines.push(close);
  return lines;
}

export function getDetailGroups(node) {
  const groups = [];
  const types = [
    { key: 'components', type: 'component', strip: true },
    { key: 'functions', type: 'function', strip: true },
    { key: 'constants', type: 'constant', strip: false },
    { key: 'hooks', type: 'hook', strip: true },
  ];
  for (const { key, type, strip } of types) {
    const items = node[key] || [];
    if (items.length === 0) continue;
    const labels = [];
    for (const item of items) {
      const cleaned = strip ? item.replace(/:\d+$/, '') : item;
      const lines = expandSignature(cleaned);
      for (let i = 0; i < lines.length; i++) {
        labels.push({ text: lines[i], cont: i > 0 });
      }
    }
    groups.push({ type, labels });
  }
  return groups;
}

/**
 * Compute layout rows from detail groups. Each group becomes one or more visual rows.
 * When a group has > COL_THRESHOLD items, items are split into columns.
 */
export function computeDetailLayout(groups) {
  const typeTags = { component: 'COMP', function: 'FN', hook: 'HOOK', constant: 'CONST' };
  const rows = [];
  let totalLines = 0;
  let maxItemW = 0;

  for (const group of groups) {
    const tag = typeTags[group.type] || '';
    const tagW = measureText(tag) + 6;
    const numCols = group.labels.length > COL_THRESHOLD ? Math.ceil(group.labels.length / COL_THRESHOLD) : 1;
    const perCol = Math.ceil(group.labels.length / numCols);
    const columns = [];
    for (let c = 0; c < numCols; c++) {
      columns.push(group.labels.slice(c * perCol, (c + 1) * perCol));
    }
    const colWidths = columns.map(col => {
      let w = 0;
      for (const label of col) {
        const lText = typeof label === 'object' ? label.text : label;
        const lTagW = (typeof label === 'object' && label.cont) ? 0 : tagW + 4;
        w = Math.max(w, lTagW + measureText(lText) + NODE_PAD_X * 2);
      }
      return w;
    });
    const rowLines = Math.max(...columns.map(c => c.length));
    totalLines += rowLines;
    const totalW = colWidths.reduce((a, b) => a + b, 0) + (numCols - 1) * 8;
    maxItemW = Math.max(maxItemW, totalW);
    rows.push({ type: group.type, columns, colWidths, rowLines });
  }
  return { rows, totalLines, maxItemW };
}

function computeNodeSize(node, expanded) {
  const nameW = measureText(node.fileName) + NODE_PAD_X * 2;
  if (!expanded) {
    return { w: Math.max(NODE_MIN_W, nameW), h: NODE_H_COLLAPSED };
  }
  const groups = getDetailGroups(node);
  const { totalLines, maxItemW } = computeDetailLayout(groups);
  const maxW = Math.max(nameW, maxItemW);
  const h = NODE_H_COLLAPSED + (totalLines > 0 ? NODE_PAD_Y + totalLines * NODE_LINE_H : 0);
  return { w: Math.max(NODE_MIN_W, maxW), h };
}

/**
 * Lay out groups in columns by parent directory path.
 * Groups sharing a parent dir stack vertically in the same column.
 * Different parent dirs are laid out left-to-right.
 */
export function layoutGraph(groups, nodes, expandedSet) {
  const positioned = new Map();
  const groupRects = [];

  const groupSizes = groups.map(group => {
    let maxNodeW = 0;
    const nodeSizes = [];
    for (const nid of group.nodeIds) {
      const node = nodes.get(nid);
      const size = computeNodeSize(node, expandedSet.has(nid));
      nodeSizes.push({ nid, ...size });
      maxNodeW = Math.max(maxNodeW, size.w);
    }
    const hasLabel = group.label !== null;
    const labelW = hasLabel ? measureText(group.label) + GROUP_PAD * 2 : 0;
    const groupW = Math.max(maxNodeW + GROUP_PAD * 2, labelW);
    const headerOffset = hasLabel ? GROUP_HEADER : 0;
    let contentH = GROUP_PAD + headerOffset;
    for (const ns of nodeSizes) {
      contentH += ns.h + NODE_GAP;
    }
    contentH = contentH - NODE_GAP + GROUP_PAD;
    return { group, nodeSizes, maxNodeW, groupW, contentH, hasLabel, headerOffset };
  });

  const columns = new Map();
  for (const gs of groupSizes) {
    const dir = gs.group.dir;
    const parts = dir.split('/');
    let parentDir;
    if (parts.length <= 1 || dir === 'src' || dir === '.') {
      parentDir = '';
    } else {
      parentDir = parts.slice(0, -1).join('/');
    }
    if (!columns.has(parentDir)) columns.set(parentDir, []);
    columns.get(parentDir).push(gs);
  }

  let cursorX = GROUP_PAD;

  for (const [, colGroups] of [...columns.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const colW = Math.max(...colGroups.map(gs => gs.groupW));
    let cursorY = 0;

    for (const gs of colGroups) {
      const { group, nodeSizes, maxNodeW, contentH, hasLabel, headerOffset } = gs;
      let nodeY = cursorY + GROUP_PAD + headerOffset;

      for (const ns of nodeSizes) {
        positioned.set(ns.nid, {
          x: cursorX + GROUP_PAD,
          y: nodeY,
          w: maxNodeW,
          h: ns.h,
        });
        nodeY += ns.h + NODE_GAP;
      }

      groupRects.push({
        ...group,
        x: cursorX,
        y: cursorY,
        w: colW,
        h: contentH,
      });

      cursorY += contentH + GROUP_GAP_Y;
    }

    cursorX += colW + GROUP_GAP_X;
  }

  const maxH = groupRects.length > 0 ? Math.max(...groupRects.map(g => g.y + g.h), 200) : 200;
  return { positioned, groupRects, totalW: cursorX, totalH: maxH };
}

export function edgePath(fromRect, toRect) {
  const fromCx = fromRect.x + fromRect.w / 2;
  const fromCy = fromRect.y + fromRect.h / 2;
  const toCx = toRect.x + toRect.w / 2;
  const toCy = toRect.y + toRect.h / 2;

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  let x1, y1, x2, y2;

  if (dy > 0) {
    x1 = fromCx; y1 = fromRect.y + fromRect.h;
    x2 = toCx;   y2 = toRect.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} V${my} H${x2} V${y2}`;
  }

  if (dy < 0) {
    x1 = fromCx; y1 = fromRect.y;
    x2 = toCx;   y2 = toRect.y + toRect.h;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} V${my} H${x2} V${y2}`;
  }

  if (dx >= 0) {
    x1 = fromRect.x + fromRect.w; y1 = fromCy;
    x2 = toRect.x;               y2 = toCy;
  } else {
    x1 = fromRect.x;             y1 = fromCy;
    x2 = toRect.x + toRect.w;    y2 = toCy;
  }
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} H${mx} V${y2} H${x2}`;
}
