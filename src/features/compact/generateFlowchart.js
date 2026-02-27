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
  const info = { components: [], functions: [], hooks: [], localImports: [], constants: [], renders: [], raw: content.trim() };

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
    if (trimmed.startsWith('renders:')) {
      const items = splitTopLevel(trimmed.slice('renders:'.length));
      for (const item of items) {
        // Parse format: Component(prop1,prop2) or Component()
        const match = item.match(/^([A-Z][a-zA-Z0-9.]*)\(([^)]*)\)$/);
        if (match) {
          const component = match[1];
          const props = match[2] ? match[2].split(',').filter(p => p) : [];
          info.renders.push({ component, props });
        }
      }
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
 * Parse component params string to extract prop names.
 * e.g., "Button({ name, icon })" -> ["name", "icon"]
 * e.g., "Button(props)" -> ["props"]
 */
function parseComponentProps(componentStr) {
  const match = componentStr.match(/\(([^)]*)\)/);
  if (!match) return [];
  
  const params = match[1].trim();
  if (!params) return [];
  
  // Handle destructured params: { prop1, prop2 }
  if (params.startsWith('{') && params.endsWith('}')) {
    const inner = params.slice(1, -1).trim();
    if (!inner) return [];
    // Split by comma and extract prop names
    return inner.split(',').map(p => {
      const trimmed = p.trim();
      // Handle default values: prop = defaultValue
      const defaultMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (defaultMatch) return defaultMatch[1];
      // Handle rest params: ...rest
      const restMatch = trimmed.match(/^\.\.\.([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
      if (restMatch) return `...${restMatch[1]}`;
      // Regular prop name
      return trimmed;
    }).filter(Boolean);
  }
  
  // Handle single param like props or single destructured array [...]
  if (params.startsWith('[') && params.endsWith(']')) {
    return [params];
  }
  
  // Single param like props
  return [params];
}

/**
 * @returns {{ groups: Array, nodes: Map, edges: Array }}
 *   groups: [{ dir, label, nodeIds }]
 *   nodes: Map<id, { id, path, fileName, components, functions, hooks, exports, raw, propsReceived, propsPassed }>
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

  // Build component name to node ID mapping
  const componentToNode = new Map();
  for (const fi of fileInfos) {
    for (const comp of fi.info.components) {
      // Extract component name (remove params)
      const compName = comp.split('(')[0];
      if (compName) {
        componentToNode.set(compName, fi.path);
      }
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
      
      // Extract props received from component signatures
      const propsReceived = [];
      for (const comp of fi.info.components) {
        const compProps = parseComponentProps(comp);
        if (compProps.length > 0) {
          propsReceived.push(...compProps);
        }
      }
      
      // Build props passed map: targetNodeId -> [propNames]
      const propsPassed = new Map();
      for (const render of fi.info.renders) {
        const targetNodeId = componentToNode.get(render.component);
        if (targetNodeId) {
          if (propsPassed.has(targetNodeId)) {
            const existing = propsPassed.get(targetNodeId);
            const newProps = [...new Set([...existing, ...render.props])];
            propsPassed.set(targetNodeId, newProps);
          } else {
            propsPassed.set(targetNodeId, render.props);
          }
        }
      }
      
      nodes.set(id, {
        id,
        path: fi.path,
        fileName,
        components: fi.info.components,
        functions: fi.info.functions,
        hooks: fi.info.hooks,
        constants: fi.info.constants,
        raw: fi.info.raw,
        propsReceived: [...new Set(propsReceived)], // deduplicate
        propsPassed,
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
