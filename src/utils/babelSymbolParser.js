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

/**
 * Extract function signatures (without bodies) from source code
 * @param {string} code - Source code to parse
 * @param {string} filePath - File path for determining parser plugins
 * @returns {Array<{name: string, signature: string, line: number}>}
 */
export const extractSignatures = (code, filePath = '') => {
  const signatures = [];
  const lines = code.split('\n');
  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts');

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
    return signatures;
  }

  const seenNames = new Set();

  /**
   * Generate parameter string from AST params
   */
  const getParamsString = (params) => {
    return params.map(param => {
      if (param.type === 'Identifier') {
        const typeAnnotation = param.typeAnnotation?.typeAnnotation;
        const typeName = typeAnnotation ? `: ${getTypeName(typeAnnotation)}` : '';
        return `${param.name}${typeName}`;
      }
      if (param.type === 'AssignmentPattern') {
        const left = param.left;
        if (left.type === 'Identifier') {
          return `${left.name} = ...`;
        }
      }
      if (param.type === 'RestElement') {
        return `...${param.argument?.name || 'args'}`;
      }
      if (param.type === 'ObjectPattern') {
        return '{ ... }';
      }
      if (param.type === 'ArrayPattern') {
        return '[ ... ]';
      }
      return '?';
    }).join(', ');
  };

  /**
   * Get type name from TypeScript type annotation
   */
  const getTypeName = (typeAnnotation) => {
    if (!typeAnnotation) return 'any';
    switch (typeAnnotation.type) {
      case 'TSStringKeyword': return 'string';
      case 'TSNumberKeyword': return 'number';
      case 'TSBooleanKeyword': return 'boolean';
      case 'TSVoidKeyword': return 'void';
      case 'TSAnyKeyword': return 'any';
      case 'TSNullKeyword': return 'null';
      case 'TSUndefinedKeyword': return 'undefined';
      case 'TSArrayType': return `${getTypeName(typeAnnotation.elementType)}[]`;
      case 'TSTypeReference': return typeAnnotation.typeName?.name || 'unknown';
      case 'TSUnionType': return typeAnnotation.types.map(getTypeName).join(' | ');
      case 'TSFunctionType': return '(...) => ...';
      default: return 'unknown';
    }
  };

  /**
   * Get return type from function
   */
  const getReturnType = (node) => {
    const returnType = node.returnType?.typeAnnotation;
    return returnType ? `: ${getTypeName(returnType)}` : '';
  };

  traverse(ast, {
    FunctionDeclaration(path) {
      const node = path.node;
      const name = node.id?.name;
      if (!name || seenNames.has(name)) return;
      seenNames.add(name);

      const params = getParamsString(node.params);
      const returnType = getReturnType(node);
      const async = node.async ? 'async ' : '';

      signatures.push({
        name,
        signature: `${async}function ${name}(${params})${returnType}`,
        line: node.loc?.start?.line || 0,
      });
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (!name || seenNames.has(name)) return;

      const init = path.node.init;
      if (!init) return;

      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        seenNames.add(name);
        const params = getParamsString(init.params);
        const returnType = getReturnType(init);
        const async = init.async ? 'async ' : '';

        signatures.push({
          name,
          signature: `${async}const ${name} = (${params})${returnType} => ...`,
          line: path.node.loc?.start?.line || 0,
        });
      }
    },
  });

  signatures.sort((a, b) => a.line - b.line);
  return signatures;
};

/**
 * Extract skeleton/outline view from source code
 * @param {string} code - Source code to parse
 * @param {string} filePath - File path for determining parser plugins
 * @returns {Object} Skeleton data with counts and structure
 */
export const extractSkeleton = (code, filePath = '') => {
  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts');

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
    return null;
  }

  const skeleton = {
    imports: [],
    exports: [],
    components: [],
    functions: [],
    hooks: { useState: 0, useEffect: 0, useCallback: 0, useMemo: 0, useRef: 0, custom: [] },
    constants: 0,
    classes: [],
    interfaces: [],
    types: [],
  };

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const specifiers = path.node.specifiers.map(s => {
        if (s.type === 'ImportDefaultSpecifier') return s.local.name;
        if (s.type === 'ImportNamespaceSpecifier') return `* as ${s.local.name}`;
        return s.imported?.name || s.local.name;
      });
      skeleton.imports.push({ source, specifiers });
    },

    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (decl.type === 'Identifier') {
        skeleton.exports.push({ name: decl.name, type: 'default' });
      } else if (decl.type === 'FunctionDeclaration' && decl.id) {
        skeleton.exports.push({ name: decl.id.name, type: 'default' });
      }
    },

    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const decl = path.node.declaration;
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          skeleton.exports.push({ name: decl.id.name, type: 'named' });
        } else if (decl.type === 'VariableDeclaration') {
          decl.declarations.forEach(d => {
            if (d.id?.name) {
              skeleton.exports.push({ name: d.id.name, type: 'named' });
            }
          });
        }
      }
      if (path.node.specifiers) {
        path.node.specifiers.forEach(s => {
          skeleton.exports.push({ name: s.exported?.name || s.local.name, type: 'named' });
        });
      }
    },

    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;

      // Check if it's a React component (PascalCase + returns JSX)
      if (isPascalCase(name)) {
        skeleton.components.push({ name, line: path.node.loc?.start?.line || 0 });
      } else {
        skeleton.functions.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      const init = path.node.init;
      if (!name || !init) return;

      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        if (isPascalCase(name)) {
          skeleton.components.push({ name, line: path.node.loc?.start?.line || 0 });
        } else {
          skeleton.functions.push({ name, line: path.node.loc?.start?.line || 0 });
        }
      } else {
        skeleton.constants++;
      }
    },

    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type === 'Identifier' && callee.name.startsWith('use')) {
        const hookName = callee.name;
        if (skeleton.hooks[hookName] !== undefined) {
          skeleton.hooks[hookName]++;
        } else {
          if (!skeleton.hooks.custom.includes(hookName)) {
            skeleton.hooks.custom.push(hookName);
          }
        }
      }
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        skeleton.classes.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },

    TSInterfaceDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        skeleton.interfaces.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },

    TSTypeAliasDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        skeleton.types.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },
  });

  return skeleton;
};

/**
 * Format signatures for prompt output
 * @param {Array} signatures - Array of signature objects
 * @returns {string}
 */
export const formatSignaturesForPrompt = (signatures) => {
  if (!signatures || signatures.length === 0) return '';
  return signatures.map(s => `    ${s.signature}  // line ${s.line}`).join('\n');
};

/**
 * Format skeleton for prompt output
 * @param {Object} skeleton - Skeleton data object
 * @returns {string}
 */
export const formatSkeletonForPrompt = (skeleton) => {
  if (!skeleton) return '';

  const lines = [];

  // Imports summary
  if (skeleton.imports.length > 0) {
    const sources = skeleton.imports.map(i => i.source).join(', ');
    lines.push(`    Imports: ${sources}`);
  }

  // Exports summary
  if (skeleton.exports.length > 0) {
    const exportNames = skeleton.exports.map(e => e.type === 'default' ? `${e.name} (default)` : e.name).join(', ');
    lines.push(`    Exports: ${exportNames}`);
  }

  // Components
  if (skeleton.components.length > 0) {
    lines.push(`    Components: ${skeleton.components.map(c => `${c.name}:${c.line}`).join(', ')}`);
  }

  // Functions
  if (skeleton.functions.length > 0) {
    lines.push(`    Functions: ${skeleton.functions.map(f => `${f.name}:${f.line}`).join(', ')}`);
  }

  // Hooks summary
  const hookCounts = [];
  if (skeleton.hooks.useState > 0) hookCounts.push(`useState(${skeleton.hooks.useState})`);
  if (skeleton.hooks.useEffect > 0) hookCounts.push(`useEffect(${skeleton.hooks.useEffect})`);
  if (skeleton.hooks.useCallback > 0) hookCounts.push(`useCallback(${skeleton.hooks.useCallback})`);
  if (skeleton.hooks.useMemo > 0) hookCounts.push(`useMemo(${skeleton.hooks.useMemo})`);
  if (skeleton.hooks.useRef > 0) hookCounts.push(`useRef(${skeleton.hooks.useRef})`);
  if (skeleton.hooks.custom.length > 0) hookCounts.push(...skeleton.hooks.custom);
  if (hookCounts.length > 0) {
    lines.push(`    Hooks: ${hookCounts.join(', ')}`);
  }

  // Constants
  if (skeleton.constants > 0) {
    lines.push(`    Constants: ${skeleton.constants}`);
  }

  // Classes
  if (skeleton.classes.length > 0) {
    lines.push(`    Classes: ${skeleton.classes.map(c => `${c.name}:${c.line}`).join(', ')}`);
  }

  // Types/Interfaces
  if (skeleton.interfaces.length > 0 || skeleton.types.length > 0) {
    const typeNames = [...skeleton.interfaces, ...skeleton.types].map(t => `${t.name}:${t.line}`).join(', ');
    lines.push(`    Types: ${typeNames}`);
  }

  return lines.join('\n');
};
