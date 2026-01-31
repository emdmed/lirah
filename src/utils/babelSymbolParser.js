import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const BABEL_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];

/**
 * Check if a file path is parseable by Babel
 * @param {string} path - File path to check
 * @returns {boolean}
 */
export const isBabelParseable = (path) => {
  return BABEL_EXTENSIONS.some(ext => path.endsWith(ext));
};

/**
 * Check if a name follows PascalCase convention (likely a React component)
 * @param {string} name - Identifier name
 * @returns {boolean}
 */
const isPascalCase = (name) => {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
};

/**
 * Extract code symbols from JavaScript/TypeScript source code
 * @param {string} code - Source code to parse
 * @param {string} filePath - File path for determining parser plugins
 * @returns {Array<{name: string, type: string, line: number, endLine: number}>}
 */
export const extractSymbols = (code, filePath = '') => {
  const symbols = [];
  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts');
  const hasJsx = filePath.endsWith('.jsx') || filePath.endsWith('.tsx');

  const plugins = [
    'jsx',
    isTypeScript && 'typescript',
    'classProperties',
    'decorators-legacy',
    'exportDefaultFrom',
    'optionalChaining',
    'nullishCoalescingOperator',
  ].filter(Boolean);

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins,
      errorRecovery: true,
    });
  } catch (error) {
    console.warn('Babel parse error:', error.message);
    return symbols;
  }

  const seenNames = new Set();

  traverse(ast, {
    // Function declarations: function foo() {}
    FunctionDeclaration(path) {
      if (path.node.id?.name && !seenNames.has(path.node.id.name)) {
        seenNames.add(path.node.id.name);
        symbols.push({
          name: path.node.id.name,
          type: 'function',
          line: path.node.loc?.start?.line || 0,
          endLine: path.node.loc?.end?.line || 0,
        });
      }
    },

    // Variable declarations: const/let/var
    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (!name || seenNames.has(name)) return;

      const init = path.node.init;
      if (!init) return;

      // Arrow function: const foo = () => {}
      if (init.type === 'ArrowFunctionExpression') {
        seenNames.add(name);
        symbols.push({
          name,
          type: 'arrow-function',
          line: path.node.loc?.start?.line || 0,
          endLine: init.loc?.end?.line || path.node.loc?.end?.line || 0,
        });
        return;
      }

      // Function expression: const foo = function() {}
      if (init.type === 'FunctionExpression') {
        seenNames.add(name);
        symbols.push({
          name,
          type: 'function',
          line: path.node.loc?.start?.line || 0,
          endLine: init.loc?.end?.line || path.node.loc?.end?.line || 0,
        });
        return;
      }

      // Other const declarations (objects, primitives, etc.)
      seenNames.add(name);
      symbols.push({
        name,
        type: 'const',
        line: path.node.loc?.start?.line || 0,
        endLine: path.node.loc?.end?.line || 0,
      });
    },

    // useEffect and other hook calls
    CallExpression(path) {
      const callee = path.node.callee;

      // Direct hook calls: useEffect(() => {})
      if (callee.type === 'Identifier' && callee.name.startsWith('use')) {
        const hookName = callee.name;
        symbols.push({
          name: hookName,
          type: 'hook',
          line: path.node.loc?.start?.line || 0,
          endLine: path.node.loc?.end?.line || 0,
        });
      }
    },

    // JSX elements - track PascalCase components
    JSXOpeningElement(path) {
      const name = path.node.name;
      let componentName = null;

      if (name.type === 'JSXIdentifier') {
        componentName = name.name;
      } else if (name.type === 'JSXMemberExpression') {
        // e.g., Sidebar.Content
        componentName = getJSXMemberName(name);
      }

      if (componentName && isPascalCase(componentName.split('.')[0])) {
        const key = `jsx:${componentName}`;
        if (!seenNames.has(key)) {
          seenNames.add(key);
          symbols.push({
            name: componentName,
            type: 'component',
            line: path.node.loc?.start?.line || 0,
            endLine: path.node.loc?.end?.line || 0,
          });
        }
      }
    },
  });

  // Sort by line number
  symbols.sort((a, b) => a.line - b.line);

  return symbols;
};

/**
 * Get the full name of a JSX member expression (e.g., Sidebar.Content)
 * @param {object} node - JSX member expression node
 * @returns {string}
 */
function getJSXMemberName(node) {
  if (node.type === 'JSXIdentifier') {
    return node.name;
  }
  if (node.type === 'JSXMemberExpression') {
    return `${getJSXMemberName(node.object)}.${node.property.name}`;
  }
  return '';
}

/**
 * Format symbols for prompt output
 * @param {Array} symbols - Array of symbol objects
 * @returns {string}
 */
export const formatSymbolsForPrompt = (symbols) => {
  if (!symbols || symbols.length === 0) {
    return '';
  }

  const lines = symbols.map(sym => {
    const lineRange = sym.line === sym.endLine
      ? `${sym.line}`
      : `${sym.line}-${sym.endLine}`;
    return `    ${sym.name} (${sym.type}): ${lineRange}`;
  });

  return lines.join('\n');
};
