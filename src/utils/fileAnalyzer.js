import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { isJSXElement, isJSXFragment } from '@babel/types';

/**
 * Check if a function path returns JSX
 */
function hasJSXReturn(functionPath) {
  let hasJSX = false;

  try {
    functionPath.traverse({
      ReturnStatement(path) {
        const argument = path.node.argument;
        if (isJSXElement(argument) || isJSXFragment(argument)) {
          hasJSX = true;
          path.stop();
        }
      }
    });
  } catch (error) {
    // Ignore traversal errors
  }

  return hasJSX;
}

/**
 * Check if a class extends React.Component or Component
 */
function extendsReactComponent(classPath) {
  const superClass = classPath.node.superClass;
  if (!superClass) return false;

  // Check for Component or React.Component
  if (superClass.name === 'Component') return true;
  if (superClass.property && superClass.property.name === 'Component') return true;
  if (superClass.object && superClass.object.name === 'React' && superClass.property && superClass.property.name === 'Component') return true;

  return false;
}

/**
 * Analyze a JavaScript/TypeScript file to extract hooks, components, and functions
 * @param {string} code - The source code to analyze
 * @param {string} filePath - The file path (for error reporting)
 * @returns {Object} Analysis results with hooks, definedComponents, usedComponents, and functions
 */
export function analyzeJSFile(code, filePath) {
  const hooks = new Set();
  const definedComponents = new Set();
  const usedComponents = new Set();
  const functions = new Set();

  try {
    // Parse the code with plugins for JSX and TypeScript
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
      errorRecovery: true
    });

    // Traverse the AST
    traverse(ast, {
      // Extract hooks from CallExpression (e.g., useState, useEffect, useCustomHook)
      CallExpression(path) {
        const callee = path.node.callee;

        // Direct call: useXxx()
        if (callee.type === 'Identifier' && callee.name && callee.name.startsWith('use')) {
          hooks.add(callee.name);
        }

        // Member call: React.useXxx()
        if (callee.type === 'MemberExpression' && callee.property && callee.property.name && callee.property.name.startsWith('use')) {
          hooks.add(callee.property.name);
        }
      },

      // Extract function declarations
      FunctionDeclaration(path) {
        const name = path.node.id?.name;
        if (!name) return;

        // Check if it returns JSX (component) or is a regular function
        if (hasJSXReturn(path)) {
          definedComponents.add(name);
        } else {
          functions.add(name);
        }
      },

      // Extract arrow functions and function expressions
      VariableDeclarator(path) {
        const name = path.node.id?.name;
        if (!name) return;

        const init = path.node.init;
        if (!init) return;

        // Check if it's a function (ArrowFunctionExpression or FunctionExpression)
        if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
          // Get the parent path to check the full function
          const functionPath = path.get('init');

          if (hasJSXReturn(functionPath)) {
            definedComponents.add(name);
          } else {
            functions.add(name);
          }
        }
      },

      // Extract class components
      ClassDeclaration(path) {
        const name = path.node.id?.name;
        if (!name) return;

        if (extendsReactComponent(path)) {
          definedComponents.add(name);
        }
      },

      // Extract used components from JSX
      JSXOpeningElement(path) {
        const name = path.node.name;

        // Handle simple JSXIdentifier (e.g., <Button />)
        if (name.type === 'JSXIdentifier') {
          usedComponents.add(name.name);
        }

        // Handle JSXMemberExpression (e.g., <React.Fragment />)
        if (name.type === 'JSXMemberExpression') {
          const memberName = name.property?.name;
          if (memberName) {
            usedComponents.add(memberName);
          }
        }

        // Handle JSXNamespacedName (e.g., <svg:path />)
        if (name.type === 'JSXNamespacedName') {
          const namespaceName = name.name?.name;
          if (namespaceName) {
            usedComponents.add(namespaceName);
          }
        }
      }
    });

    return {
      hooks: [...hooks].sort(),
      definedComponents: [...definedComponents].sort(),
      usedComponents: [...usedComponents].sort(),
      functions: [...functions].sort()
    };

  } catch (error) {
    // Return error if parsing fails
    return {
      error: error.message || 'Failed to parse file'
    };
  }
}

/**
 * Check if a file is supported for analysis (JS/TS/JSX/TSX)
 * @param {string} fileName - The file name to check
 * @returns {boolean} True if the file is supported
 */
export function isSupportedFile(fileName) {
  return /\.(jsx?|tsx?)$/i.test(fileName);
}
