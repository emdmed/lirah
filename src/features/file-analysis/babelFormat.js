// Prompt formatters for babelSymbolParser output. Kept apart from the parser
// so the main bundle can format results without pulling in Babel.

export const formatSymbolsForPrompt = (symbols) => {
  if (!symbols || symbols.length === 0) return '';
  return symbols.map(sym => {
    const lineRange = sym.line === sym.endLine ? `${sym.line}` : `${sym.line}-${sym.endLine}`;
    return `    ${sym.name} (${sym.type}): ${lineRange}`;
  }).join('\n');
};

export const formatSignaturesForPrompt = (signatures) => {
  if (!signatures || signatures.length === 0) return '';
  return signatures.map(s => `    ${s.signature}  // line ${s.line}`).join('\n');
};

export const formatSkeletonForPrompt = (skeleton) => {
  if (!skeleton) return '';

  const lines = [];

  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.source.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...[...new Set(local.map(i => i.source))]);
    lines.push(`imports: ${parts.join(', ')}`);
  }

  if (skeleton.jsxUsage.length > 0) {
    const rendersList = skeleton.jsxUsage.map(u => {
      const propsStr = u.props.join(',');
      return `${u.component}(${propsStr})`;
    }).join(', ');
    lines.push(`renders: ${rendersList}`);
  }

  if (skeleton.components.length > 0) {
    const componentList = skeleton.components.map(c => {
      const marker = c.exportMarker || '';
      const params = c.params !== undefined ? `(${c.params})` : '';
      const hoc = c.hoc ? `(${c.hoc})` : '';
      return `${c.name}${hoc}${params}${marker}:${c.line}`;
    }).join(', ');
    lines.push(`components: ${componentList}`);
  }

  if (skeleton.contexts?.length > 0) {
    lines.push(`contexts: ${skeleton.contexts.map(c => `${c.name}:${c.line}`).join(', ')}`);
  }

  if (skeleton.functions.length > 0) {
    const funcList = skeleton.functions.map(f => {
      const marker = f.exportMarker || '';
      const asyncPrefix = f.async ? 'async ' : '';
      const params = f.params !== undefined ? `(${f.params})` : '';
      return `${asyncPrefix}${f.name}${params}${marker}:${f.line}`;
    }).join(', ');
    lines.push(`fn: ${funcList}`);
  }

  if (skeleton.constants.length > 0) {
    const names = skeleton.constants;
    if (names.length > 5) {
      lines.push(`const: ${names.slice(0, 5).join(', ')} +${names.length - 5} more`);
    } else {
      lines.push(`const: ${names.join(', ')}`);
    }
  }

  const hookParts = [];
  if (skeleton.hooks.useState.length > 0) hookParts.push(`useState: ${skeleton.hooks.useState.join(', ')}`);
  if (skeleton.hooks.useCallback > 0) hookParts.push(`useCallback(${skeleton.hooks.useCallback})`);
  if (skeleton.hooks.useMemo > 0) hookParts.push(`useMemo(${skeleton.hooks.useMemo})`);
  if (skeleton.hooks.useRef > 0) hookParts.push(`useRef(${skeleton.hooks.useRef})`);
  if (skeleton.hooks.custom.length > 0) hookParts.push(...skeleton.hooks.custom);

  if (skeleton.hooks.useEffect.length > 0) {
    const effects = skeleton.hooks.useEffect.map(eff => {
      if (eff.deps === null) return `useEffect(∞)`;
      if (eff.deps === '?') return `useEffect(?)`;
      return `useEffect([${eff.deps.join(',')}])`;
    });
    hookParts.push(...effects);
  }

  if (hookParts.length > 0) {
    lines.push(`hooks: ${hookParts.join(', ')}`);
  }

  if (skeleton.classes.length > 0) {
    const classList = skeleton.classes.map(c => {
      const marker = c.exportMarker || '';
      return `${c.name}${marker}:${c.line}`;
    }).join(', ');
    lines.push(`classes: ${classList}`);
  }

  if (skeleton.interfaces.length > 0 || skeleton.types.length > 0) {
    const typeNames = [...skeleton.interfaces, ...skeleton.types].map(t => `${t.name}:${t.line}`).join(', ');
    lines.push(`types: ${typeNames}`);
  }

  return lines.join('\n');
};
