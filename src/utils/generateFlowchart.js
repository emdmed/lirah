/**
 * Parse compacted project output into a graph structure for interactive rendering.
 * Returns nodes (files grouped by directory) and edges (local imports).
 */

function parseSections(output) {
  if (!output) return [];
  const sections = [];
  const lines = output.split('\n');
  let currentPath = null;
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentPath !== null) {
        sections.push({ path: currentPath, content: currentLines.join('\n') });
      }
      currentPath = line.slice(3).trim();
      currentLines = [];
    } else if (currentPath !== null) {
      currentLines.push(line);
    }
  }
  if (currentPath !== null) {
    sections.push({ path: currentPath, content: currentLines.join('\n') });
  }
  return sections;
}

/**
 * Split a string by commas, but only at the top level (not inside parentheses, braces, or brackets).
 */
function splitTopLevel(str) {
  const results = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      results.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) results.push(current.trim());
  return results.filter(Boolean);
}

function extractInfo(content) {
  const info = { components: [], functions: [], hooks: [], localImports: [], constants: [], raw: content.trim() };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('components:')) {
      info.components = splitTopLevel(trimmed.slice('components:'.length));
    }
    if (trimmed.startsWith('fn:')) {
      info.functions = splitTopLevel(trimmed.slice('fn:'.length));
    }
    if (trimmed.startsWith('hooks:')) {
      info.hooks = splitTopLevel(trimmed.slice('hooks:'.length));
    }
    if (trimmed.startsWith('const:')) {
      info.constants = splitTopLevel(trimmed.slice('const:'.length));
    }
    if (trimmed.startsWith('imports:')) {
      const items = splitTopLevel(trimmed.slice('imports:'.length));
      for (const item of items) {
        if (item.startsWith('./') || item.startsWith('../')) {
          info.localImports.push(item);
        }
      }
    }
  }
  return info;
}

function resolveImportPath(fromPath, importPath) {
  const fromParts = fromPath.split('/');
  fromParts.pop();
  const importParts = importPath.split('/');
  const resolved = [...fromParts];
  for (const part of importParts) {
    if (part === '..') resolved.pop();
    else if (part !== '.') resolved.push(part);
  }
  return resolved.join('/');
}

/**
 * @returns {{ groups: Array, nodes: Map, edges: Array }}
 *   groups: [{ dir, label, nodeIds }]
 *   nodes: Map<id, { id, path, fileName, components, functions, hooks, exports, raw }>
 *   edges: [{ from, to }]
 */
export function buildGraphData(compactedOutput) {
  const sections = parseSections(compactedOutput);
  const nodes = new Map();
  const edges = [];

  if (sections.length === 0) return { groups: [], nodes, edges };

  const fileInfos = sections.map(s => ({ path: s.path, info: extractInfo(s.content) }));

  // Path resolution map
  const pathMap = new Map();
  for (const fi of fileInfos) {
    const noExt = fi.path.replace(/\.\w+$/, '');
    pathMap.set(noExt, fi.path);
    if (noExt.endsWith('/index')) {
      pathMap.set(noExt.replace(/\/index$/, ''), fi.path);
    }
  }

  // Group by directory
  const dirMap = new Map();
  for (const fi of fileInfos) {
    const parts = fi.path.split('/');
    parts.pop();
    const dir = parts.join('/') || '.';
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir).push(fi);
  }

  const groups = [];
  for (const [dir, files] of [...dirMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const isSrcRoot = dir === 'src' || dir === '.';
    const label = isSrcRoot ? null : dir.replace(/^src\//, '');
    const nodeIds = [];

    for (const fi of files) {
      const id = fi.path;
      const fileName = fi.path.split('/').pop().replace(/\.\w+$/, '');
      nodes.set(id, {
        id,
        path: fi.path,
        fileName,
        components: fi.info.components,
        functions: fi.info.functions,
        hooks: fi.info.hooks,
        constants: fi.info.constants,
        raw: fi.info.raw,
      });
      nodeIds.push(id);
    }

    groups.push({ dir, label, nodeIds });
  }

  // Edges
  for (const fi of fileInfos) {
    for (const imp of fi.info.localImports) {
      const resolved = resolveImportPath(fi.path, imp);
      const target = pathMap.get(resolved);
      if (target && nodes.has(target)) {
        edges.push({ from: fi.path, to: target });
      }
    }
  }

  return { groups, nodes, edges };
}
