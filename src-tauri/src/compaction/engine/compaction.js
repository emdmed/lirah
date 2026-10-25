#!/usr/bin/env node

// agentic-compaction v0.0.10
// Single-file bundle — compact a JS/TS/Python/C#/Rust project into a structural skeleton
// Also indexes package.json (name/scripts/deps), CSS/SCSS/LESS (ids/classes),
// and lists .md files by path with their first heading
// Zero dependencies — uses only built-in Node.js modules
// Source: https://github.com/emdmed/agentic-compaction
//
// Usage:
//   node compaction.js [path] [--json]

import { readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync, lstatSync, renameSync, existsSync } from 'fs';
import { resolve, join, basename, dirname, relative, posix, sep } from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import {
  stripCommentsAndStrings, readUntilBalanced as _readUntilBalanced,
  extractBalancedGenerics, simplifyTypeAnnotation,
  consumeModifiers, detectLanguage,
  getGitSha, getDateStamp, SKIP_DIRECTORIES,
  JS_EXTENSIONS, PY_EXTENSIONS, CS_EXTENSIONS, RS_EXTENSIONS,
} from './parse-utils.js';

// Every constant with its line: grepping for any one of them must find it
const formatConstants = (constants) => `const: ${constants.map(c => `${c.name}:${c.line}`).join(', ')}`;

// ── Parsers: Python ──

const isPythonParseable = (path) => PY_EXTENSIONS.some(ext => path.endsWith(ext));

const extractPythonSkeleton = (code, filePath = '') => {
  const cleaned = stripCommentsAndStrings(code, 'py');
  const lines = cleaned.split('\n');
  const skeleton = { imports: [], functions: [], classes: [], constants: [] };
  let pendingDecorators = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/^\s*$/.test(line)) continue;
    if (/^\s/.test(line) && !/^@/.test(line)) { pendingDecorators = []; continue; }

    const decoratorMatch = line.match(/^@(\w[\w.]*)/);
    if (decoratorMatch) { pendingDecorators.push(decoratorMatch[1]); continue; }

    const importMatch = line.match(/^import\s+(.+)/);
    if (importMatch) {
      const modules = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
      for (const mod of modules) skeleton.imports.push({ module: mod, names: [] });
      pendingDecorators = []; continue;
    }

    const fromImportMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromImportMatch) {
      const module = fromImportMatch[1];
      let namesStr = fromImportMatch[2].trim();
      if (namesStr.startsWith('(')) {
        namesStr = namesStr.slice(1);
        while (i + 1 < lines.length && !namesStr.includes(')')) { i++; namesStr += ' ' + lines[i].trim(); }
        namesStr = namesStr.replace(')', '');
      }
      const names = namesStr.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      skeleton.imports.push({ module, names });
      pendingDecorators = []; continue;
    }

    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (funcMatch) {
      let params = funcMatch[2];
      if (!line.includes(')')) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(')')) { params += ' ' + lines[j].trim(); j++; }
        if (j < lines.length) params += ' ' + lines[j].split(')')[0].trim();
      }
      params = params.replace(/\s+/g, ' ').trim();
      skeleton.functions.push({ name: funcMatch[1], line: lineNum, decorators: [...pendingDecorators], params });
      pendingDecorators = []; continue;
    }

    const classMatch = line.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (classMatch) {
      const bases = classMatch[2] ? classMatch[2].split(',').map(s => s.trim()).filter(Boolean) : [];
      skeleton.classes.push({ name: classMatch[1], line: lineNum, decorators: [...pendingDecorators], bases });
      pendingDecorators = []; continue;
    }

    const assignMatch = line.match(/^([A-Za-z_]\w*)\s*[=:]/);
    if (assignMatch) { skeleton.constants.push({ name: assignMatch[1], line: lineNum }); pendingDecorators = []; continue; }

    pendingDecorators = [];
  }
  return skeleton;
};

const formatPythonSkeleton = (skeleton) => {
  if (!skeleton) return '';
  const lines = [];
  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.module.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...local.map(i => i.module));
    lines.push(`imports: ${parts.join(', ')}`);
  }
  if (skeleton.classes.length > 0) {
    lines.push(`classes: ${skeleton.classes.map(c => {
      const parts = [c.name];
      if (c.decorators.length > 0) parts.push(`@${c.decorators[0]}`);
      if (c.bases.length > 0) parts.push(`(${c.bases.join(',')})`);
      return `${parts.join(' ')}:${c.line}`;
    }).join(', ')}`);
  }
  if (skeleton.functions.length > 0) {
    for (const f of skeleton.functions) {
      const deco = f.decorators.length > 0 ? `@${f.decorators[0]} ` : '';
      lines.push(`fn: ${deco}${f.name}(${f.params || ''}):${f.line}`);
    }
  }
  if (skeleton.constants.length > 0) {
    lines.push(formatConstants(skeleton.constants));
  }
  return lines.join('\n');
};

// ── Parsers: C# ──

const isCSharpParseable = (path) => CS_EXTENSIONS.some(ext => path.endsWith(ext));

const extractCSharpSkeleton = (code, filePath = '') => {
  const cleaned = stripCommentsAndStrings(code, 'cs');
  const lines = cleaned.split('\n');
  const skeleton = { usings: [], namespaces: [], classes: [], interfaces: [], enums: [], functions: [], constants: [] };
  let pendingAttributes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Attributes — single-line [Attr] or multi-line [Attr(\n...\n)]
    if (trimmed.startsWith('[') && !trimmed.startsWith('[assembly:')) {
      let attrText = trimmed;
      if (!attrText.includes(']')) {
        // Multi-line attribute: accumulate until balanced
        const balanced = readUntilBalanced(lines, i, '[', ']');
        attrText = balanced.text;
        i = balanced.endIndex;
      }
      // Extract all attributes from potential [Attr1][Attr2] or [Attr1, Attr2]
      const attrRegex = /\[([^\]]+)\]/g;
      let attrM;
      while ((attrM = attrRegex.exec(attrText)) !== null) {
        const attrs = attrM[1].split(',');
        for (const a of attrs) {
          const name = a.trim().split('(')[0].trim();
          if (name) pendingAttributes.push(name);
        }
      }
      continue;
    }

    // Using directives (including aliases: using Foo = Bar.Baz;)
    const usingMatch = trimmed.match(/^using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/);
    if (usingMatch) { skeleton.usings.push(usingMatch[1]); pendingAttributes = []; continue; }

    // Namespace
    const nsMatch = trimmed.match(/^(?:file\s+)?namespace\s+([\w.]+)/);
    if (nsMatch) { skeleton.namespaces.push(nsMatch[1]); pendingAttributes = []; continue; }

    // Enum
    const enumMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*enum\s+(\w+)/);
    if (enumMatch) {
      skeleton.enums.push({ name: enumMatch[1], line: lineNum, attributes: [...pendingAttributes] });
      pendingAttributes = []; continue;
    }

    // Interface — modifier-loop + nested-generic-aware
    {
      const tokens = trimmed.split(/\s+/);
      const { modifiers: ifMods, rest: ifRest } = consumeModifiers(tokens);
      if (ifRest.length >= 2 && ifRest[0] === 'interface') {
        let ifName = ifRest[1];
        // Strip generic suffix from name token e.g. "IFoo<T," → "IFoo"
        const genIdx = ifName.indexOf('<');
        if (genIdx > 0) ifName = ifName.slice(0, genIdx);
        // Skip past generics in the full line
        let afterName = trimmed.slice(trimmed.indexOf(ifName) + ifName.length).trim();
        if (afterName.startsWith('<')) {
          const gen = extractBalancedGenerics(afterName, 0);
          if (gen) afterName = afterName.slice(gen.endIndex + 1).trim();
        }
        const basesMatch = afterName.match(/^:\s*(.+?)(?:\s*\{|$)/);
        const bases = basesMatch ? basesMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
        skeleton.interfaces.push({ name: ifName, line: lineNum, attributes: [...pendingAttributes], bases });
        pendingAttributes = []; continue;
      }
    }

    // Class / struct / record — modifier-loop + generic-aware
    {
      const tokens = trimmed.split(/\s+/);
      const { modifiers: clsMods, rest: clsRest } = consumeModifiers(tokens);
      const clsKeyword = clsRest[0];
      if (clsRest.length >= 2 && (clsKeyword === 'class' || clsKeyword === 'struct' || clsKeyword === 'record')) {
        let clsName = clsRest[1];
        const genIdx = clsName.indexOf('<');
        if (genIdx > 0) clsName = clsName.slice(0, genIdx);
        // Skip past generics
        let afterName = trimmed.slice(trimmed.indexOf(clsKeyword) + clsKeyword.length).trim();
        afterName = afterName.slice(afterName.indexOf(clsName) + clsName.length).trim();
        if (afterName.startsWith('<')) {
          const gen = extractBalancedGenerics(afterName, 0);
          if (gen) afterName = afterName.slice(gen.endIndex + 1).trim();
        }
        // Record primary constructor params
        let params;
        if (afterName.startsWith('(')) {
          const balanced = readUntilBalanced(lines, i, '(', ')');
          const pMatch = balanced.text.match(/\(([^)]*)\)/);
          params = pMatch ? pMatch[1].replace(/\s+/g, ' ').trim() : undefined;
          i = balanced.endIndex;
          afterName = balanced.text.slice(balanced.text.indexOf(')') + 1).trim();
        }
        const basesMatch = afterName.match(/^:\s*(.+?)(?:\s*\{|$|\s*;|$)/);
        const bases = basesMatch ? basesMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
        skeleton.classes.push({
          name: clsName, line: lineNum, attributes: [...pendingAttributes], bases, params,
          static: clsMods.has('static'), abstract: clsMods.has('abstract'),
        });
        pendingAttributes = []; continue;
      }
    }

    // Methods — modifier-loop + generic-aware return type matching
    {
      const tokens = trimmed.split(/\s+/);
      const { modifiers: methMods, rest: methRest } = consumeModifiers(tokens);
      // Need at least return-type + name + '(' — methRest should have >= 2 tokens
      // and the line must contain '(' somewhere
      if (methRest.length >= 2 && trimmed.includes('(') &&
          !trimmed.includes(' class ') && !trimmed.includes(' interface ') &&
          !trimmed.includes(' struct ') && !trimmed.includes(' enum ')) {
        const restStr = methRest.join(' ');
        let pos = 0;
        // Skip return type: either tuple (...) or identifier + optional <...>
        if (restStr.startsWith('(')) {
          // Tuple return type: (bool Success, string Message, ...)
          let depth = 0;
          for (; pos < restStr.length; pos++) {
            if (restStr[pos] === '(') depth++;
            else if (restStr[pos] === ')') { depth--; if (depth === 0) { pos++; break; } }
          }
        } else {
          const retTypeMatch = restStr.match(/^[\w.]+/);
          if (retTypeMatch) {
            pos = retTypeMatch[0].length;
            // Check for generics on return type
            const afterRetType = restStr.slice(pos);
            if (afterRetType.startsWith('<')) {
              const gen = extractBalancedGenerics(afterRetType, 0);
              if (gen) pos += gen.endIndex + 1;
            }
          }
        }
        // Check for array brackets [] or nullable ?
        while (pos < restStr.length && (restStr[pos] === '[' || restStr[pos] === ']' || restStr[pos] === '?' || restStr[pos] === ' ')) pos++;
        // Extract method name — may be followed by <...> for generic methods
        const nameMatch = restStr.slice(pos).match(/^(\w+)\s*(?:<|$|\()/);
        if (nameMatch) {
          const name = nameMatch[1];
          // Skip generic type params on method name if present
          let afterNamePos = pos + name.length;
          while (afterNamePos < restStr.length && restStr[afterNamePos] === ' ') afterNamePos++;
          if (afterNamePos < restStr.length && restStr[afterNamePos] === '<') {
            const gen = extractBalancedGenerics(restStr, afterNamePos);
            if (gen) afterNamePos = gen.endIndex + 1;
          }
          // Verify there's a '(' after the name (+ optional generics)
          while (afterNamePos < restStr.length && restStr[afterNamePos] === ' ') afterNamePos++;
          const hasOpenParen = afterNamePos < restStr.length && restStr[afterNamePos] === '(' || trimmed.includes(name + '(') || trimmed.includes(name + '<');
          const skipNames = new Set(['get', 'set', 'if', 'for', 'while', 'switch', 'catch', 'using', 'return', 'new', 'class', 'struct', 'record', 'interface', 'enum', 'namespace', 'delegate']);
          if (hasOpenParen && !skipNames.has(name)) {
            // Find the method's parameter '(' — locate it after the method name
            // (+ optional generics), skipping any tuple return type parens
            let paramStartLine = i;
            let params = '';
            // Build a contiguous string from current line onward to find the method name
            let searchBuf = lines[i].trim();
            let searchEnd = i;
            // Ensure we have enough text to find the method params (may span lines)
            while (searchEnd < lines.length - 1 && !new RegExp(name + '\\s*(?:<[^>]*>\\s*)?\\(').test(searchBuf)) {
              searchEnd++;
              searchBuf += ' ' + lines[searchEnd].trim();
            }
            // Find the method name + optional generics + '(' in the buffer
            const methNameRegex = new RegExp(name + '\\s*(?:<[\\s\\S]*?>\\s*)?\\(');
            const methNameMatch = methNameRegex.exec(searchBuf);
            if (methNameMatch) {
              // Count how many '(' occur before the method's '(' in the buffer
              const beforeMethParen = searchBuf.slice(0, methNameMatch.index + methNameMatch[0].length - 1);
              let extraOpenParens = 0;
              for (const ch of beforeMethParen) {
                if (ch === '(') extraOpenParens++;
                else if (ch === ')') extraOpenParens--;
              }
              // Now use readUntilBalanced, but we need to account for the extra parens
              // Simpler: find the paren position in the original lines and read from there
              // Build full signature from the method's paren onward
              const fullSig = searchBuf.slice(methNameMatch.index + methNameMatch[0].length - 1);
              // Use string-based balanced paren extraction
              let depth = 0;
              let paramContent = '';
              let foundClose = false;
              for (const ch of fullSig) {
                if (ch === '(') depth++;
                else if (ch === ')') {
                  depth--;
                  if (depth === 0) { foundClose = true; break; }
                }
                if (depth > 0 && !(depth === 1 && ch === '(')) paramContent += ch;
              }
              if (!foundClose) {
                // Params span more lines — continue reading
                let j = searchEnd + 1;
                while (j < lines.length && !foundClose) {
                  const extra = lines[j].trim();
                  for (const ch of extra) {
                    if (ch === '(') depth++;
                    else if (ch === ')') {
                      depth--;
                      if (depth === 0) { foundClose = true; break; }
                    }
                    if (depth > 0 && !(depth === 1 && ch === '(')) paramContent += ch;
                    else if (depth === 1 && ch === '(') paramContent += ch;
                  }
                  searchEnd = j;
                  j++;
                }
              }
              params = paramContent.replace(/\s+/g, ' ').trim();
            }
            i = searchEnd;
            skeleton.functions.push({
              name, line: lineNum, attributes: [...pendingAttributes], params,
              async: methMods.has('async'), static: methMods.has('static'),
            });
            pendingAttributes = []; continue;
          }
        }
      }
    }

    // Constants (const fields)
    const constMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:readonly\s+)?const\s+\w+\s+(\w+)/);
    if (constMatch) { skeleton.constants.push({ name: constMatch[1], line: lineNum }); pendingAttributes = []; continue; }

    pendingAttributes = [];
  }
  return skeleton;
};

const formatCSharpSkeleton = (skeleton) => {
  if (!skeleton) return '';
  const lines = [];
  if (skeleton.usings.length > 0) {
    const parts = [];
    parts.push(`${skeleton.usings.length} usings`);
    lines.push(`imports: ${parts.join(', ')}`);
  }
  if (skeleton.namespaces.length > 0) {
    lines.push(`namespace: ${skeleton.namespaces.join(', ')}`);
  }
  if (skeleton.interfaces.length > 0) {
    lines.push(`interfaces: ${skeleton.interfaces.map(iface => {
      const parts = [iface.name];
      if (iface.attributes.length > 0) parts.push(`@${iface.attributes[0]}`);
      if (iface.bases.length > 0) parts.push(`(${iface.bases.join(',')})`);
      return `${parts.join(' ')}:${iface.line}`;
    }).join(', ')}`);
  }
  if (skeleton.classes.length > 0) {
    lines.push(`classes: ${skeleton.classes.map(c => {
      const parts = [c.name];
      if (c.attributes.length > 0) parts.push(`@${c.attributes[0]}`);
      if (c.bases.length > 0) parts.push(`(${c.bases.join(',')})`);
      return `${parts.join(' ')}:${c.line}`;
    }).join(', ')}`);
  }
  if (skeleton.enums.length > 0) {
    lines.push(`enums: ${skeleton.enums.map(e => `${e.name}:${e.line}`).join(', ')}`);
  }
  if (skeleton.functions.length > 0) {
    for (const f of skeleton.functions) {
      const asyncPrefix = f.async ? 'async ' : '';
      const staticPrefix = f.static ? 'static ' : '';
      lines.push(`fn: ${staticPrefix}${asyncPrefix}${f.name}(${f.params || ''}):${f.line}`);
    }
  }
  if (skeleton.constants.length > 0) {
    lines.push(formatConstants(skeleton.constants));
  }
  return lines.join('\n');
};

// ── Parsers: Rust ──

const isRustParseable = (path) => RS_EXTENSIONS.some(ext => path.endsWith(ext));

// Split on top-level commas, ignoring commas nested in <>, (), [], {}.
const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
};

// `fn foo<T: Bound>(a: A, mut b: B)` → "a, b" (receiver `self` dropped).
const rustParamNames = (sig, name) => {
  let k = sig.indexOf(name) + name.length;
  while (k < sig.length && /\s/.test(sig[k])) k++;
  if (sig[k] === '<') {
    let depth = 0;
    for (; k < sig.length; k++) {
      if (sig[k] === '<') depth++;
      else if (sig[k] === '>' && sig[k - 1] !== '-' && --depth === 0) { k++; break; }
    }
  }
  const open = sig.indexOf('(', k);
  if (open === -1) return '';
  let depth = 0, close = open;
  for (; close < sig.length; close++) {
    if (sig[close] === '(') depth++;
    else if (sig[close] === ')' && --depth === 0) break;
  }
  return splitTopLevel(sig.slice(open + 1, close))
    .map(p => p.split(':')[0].replace(/^(mut|ref)\s+/, '').replace(/^&\s*('\w+\s+)?(mut\s+)?/, '').trim())
    .filter(p => p && p !== 'self')
    .join(', ');
};

const RS_VIS = String.raw`(?:pub(?:\s*\([^)]*\))?\s+)?`;
const RS_FN_RE = new RegExp(`^(${RS_VIS})((?:(?:const|async|unsafe|extern(?:\\s+\\w+)?)\\s+)*)fn\\s+(\\w+)`);
const RS_TYPE_RE = new RegExp(`^(${RS_VIS})(struct|enum|trait|union|type)\\s+(\\w+)`);
const RS_CONST_RE = new RegExp(`^(${RS_VIS})(?:const|static(?:\\s+mut)?)\\s+(\\w+)`);
const RS_MOD_RE = new RegExp(`^(${RS_VIS})mod\\s+(\\w+)\\s*([;{])`);
const RS_USE_RE = new RegExp(`^${RS_VIS}use\\s+([^;]+);?`);

const extractRustSkeleton = (code) => {
  const lines = stripCommentsAndStrings(code, 'rs').split('\n');
  const skeleton = { mods: [], uses: [], commands: [], functions: [], types: [], impls: [], constants: [], macros: [] };
  let depth = 0;
  let attrs = [];
  let block = null;      // { kind: 'impl'|'skip', depth, impl? } for the block we're inside
  let pendingBlock = null; // block opened by an item whose `{` is on a later line

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const startDepth = depth;
    depth += opens - closes;

    if (pendingBlock && opens > 0) { block = { ...pendingBlock, depth: startDepth + 1 }; pendingBlock = null; }
    if (block && depth < block.depth) block = null;
    if (!trimmed) continue;

    const attr = trimmed.match(/^#!?\[(.+)\]\s*$/);
    if (attr) { attrs.push(attr[1]); continue; }
    if (trimmed.startsWith('#[') || trimmed.startsWith('#![')) continue; // multi-line attribute
    const itemAttrs = attrs;
    attrs = [];

    const inImpl = block && block.kind === 'impl' && startDepth === block.depth;
    if (startDepth !== 0 && !inImpl) continue;

    const isTest = itemAttrs.some(a => /^cfg\(\s*test\s*\)$/.test(a) || a === 'test' || /::test$/.test(a));
    const openBlock = (b) => {
      if (opens > 0) { if (depth > startDepth) block = { ...b, depth: startDepth + 1 }; }
      else if (!trimmed.endsWith(';')) pendingBlock = b; // signature continues; `{` comes later
    };

    let m;
    if (inImpl) {
      if ((m = trimmed.match(RS_FN_RE)) && !isTest) block.impl.methods.push(m[3]);
      continue;
    }

    if (isTest) { if (!trimmed.endsWith(';')) openBlock({ kind: 'skip' }); continue; }

    if ((m = trimmed.match(RS_USE_RE))) {
      skeleton.uses.push(m[1].replace(/\s+/g, ''));
    } else if ((m = trimmed.match(RS_MOD_RE))) {
      skeleton.mods.push(m[2]);
      if (m[3] === '{') openBlock({ kind: 'skip' });
    } else if ((m = trimmed.match(RS_FN_RE))) {
      const sig = readUntilBalanced(lines, i, '(', ')').text;
      const entry = { name: m[3], pub: !!m[1], async: /async/.test(m[2]), params: rustParamNames(sig, m[3]), line: lineNum };
      if (itemAttrs.some(a => /^(tauri::)?command\b/.test(a))) skeleton.commands.push(entry);
      else skeleton.functions.push(entry);
      openBlock({ kind: 'skip' });
    } else if ((m = trimmed.match(/^(?:unsafe\s+)?impl\b\s*(<[^{]*?>)?\s*(.+?)\s*(?:where\b.*)?\{?\s*$/))) {
      // Drop lifetimes (`Session<'a>` → `Session`); they add noise, not navigation value.
      const head = m[2].replace(/\s+/g, ' ').replace(/'\w+\s*,?\s*/g, '').replace(/<\s*>/g, '');
      const forMatch = head.match(/^(.+?)\s+for\s+(.+)$/);
      const impl = forMatch
        ? { target: forMatch[2].trim(), trait: forMatch[1].trim(), methods: [], line: lineNum }
        : { target: head.trim(), trait: null, methods: [], line: lineNum };
      skeleton.impls.push(impl);
      openBlock({ kind: 'impl', impl });
    } else if ((m = trimmed.match(RS_TYPE_RE))) {
      const derives = itemAttrs.filter(a => a.startsWith('derive(')).flatMap(a => a.slice(7, -1).split(',').map(d => d.trim()));
      skeleton.types.push({ kind: m[2], name: m[3], pub: !!m[1], derives, line: lineNum });
      if (m[2] === 'trait') {
        const impl = { target: m[3], trait: null, methods: [], line: lineNum, isTrait: true };
        skeleton.impls.push(impl);
        openBlock({ kind: 'impl', impl });
      } else openBlock({ kind: 'skip' });
    } else if ((m = trimmed.match(RS_CONST_RE))) {
      skeleton.constants.push({ name: m[2], line: lineNum });
      openBlock({ kind: 'skip' });
    } else if ((m = trimmed.match(/^macro_rules!\s*(\w+)/))) {
      skeleton.macros.push(m[1]);
      openBlock({ kind: 'skip' });
    }
  }
  return skeleton;
};

// Derives that say nothing about a type's role; Serialize/Deserialize etc. do (IPC, persistence).
const COMMON_DERIVES = new Set(['Debug', 'Clone', 'Copy', 'PartialEq', 'Eq', 'Hash', 'Default', 'PartialOrd', 'Ord']);

const formatRustSkeleton = (s) => {
  if (!s) return '';
  const lines = [];
  const fmtFn = (f) => `${f.pub ? 'pub ' : ''}${f.async ? 'async ' : ''}${f.name}(${f.params}):${f.line}`;
  if (s.mods.length) lines.push(`mods: ${s.mods.join(', ')}`);
  if (s.uses.length) {
    // Local paths (crate::/super::/self::) are what matter for navigation; external crates are just counted.
    const local = [...new Set(s.uses.filter(u => /^(crate|super|self)::/.test(u)).map(u => u.replace(/::\{.*$/, '').replace(/::[A-Z]\w*$/, '')))];
    const extCount = s.uses.length - s.uses.filter(u => /^(crate|super|self)::/.test(u)).length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...local);
    lines.push(`uses: ${parts.join(', ')}`);
  }
  if (s.commands.length) lines.push(`commands: ${s.commands.map(fmtFn).join(', ')}`);
  for (const f of s.functions) lines.push(`fn: ${fmtFn(f)}`);
  if (s.types.length) {
    lines.push(`types: ${s.types.map(t => {
      const derives = t.derives.filter(d => !COMMON_DERIVES.has(d));
      const deriveTag = derives.length ? `[${derives.join(',')}]` : '';
      return `${t.pub ? 'pub ' : ''}${t.kind} ${t.name}${deriveTag}:${t.line}`;
    }).join(', ')}`);
  }
  for (const impl of s.impls) {
    const label = impl.isTrait ? `trait ${impl.target}` : impl.trait ? `${impl.trait} for ${impl.target}` : impl.target;
    lines.push(`impl ${label}:${impl.line}${impl.methods.length ? ` { ${impl.methods.join(', ')} }` : ''}`);
  }
  if (s.constants.length) {
    lines.push(formatConstants(s.constants));
  }
  if (s.macros.length) lines.push(`macros: ${s.macros.join(', ')}`);
  return lines.join('\n');
};

// ── Parsers: JS/TS (regex-based, zero dependencies) ──

const isJsParseable = (path) => JS_EXTENSIONS.some(ext => path.endsWith(ext));

// ── package.json & Markdown ──

const isPackageJson = (path) => basename(path) === 'package.json';
const isMarkdownParseable = (path) => path.endsWith('.md');

// First ATX heading (outside code fences), so a doc's path comes with what it is about.
const extractMarkdownTitle = (code) => {
  let inFence = false;
  for (const line of code.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/);
    if (m) {
      const title = m[1].replace(/[*_`]/g, '');
      return { title: title.length > 80 ? title.slice(0, 77) + '...' : title };
    }
  }
  return null;
};

// package.json: keep structural keys only (names, not version ranges/values).
const extractPackageJsonSkeleton = (code) => {
  let pkg;
  try { pkg = JSON.parse(code); } catch { return null; }
  return {
    name: pkg.name || null,
    version: pkg.version || null,
    scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
    dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
    devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
  };
};

const formatPackageJsonSkeleton = (s) => {
  if (!s) return '';
  const lines = [];
  if (s.name) lines.push(`name: ${s.name}${s.version ? `@${s.version}` : ''}`);
  if (s.scripts.length) lines.push(`scripts: ${s.scripts.join(', ')}`);
  if (s.dependencies.length) lines.push(`dependencies: ${s.dependencies.join(', ')}`);
  if (s.devDependencies.length) lines.push(`devDependencies: ${s.devDependencies.join(', ')}`);
  return lines.join('\n');
};
// ── CSS / SCSS / LESS ──

const CSS_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];
const isCssParseable = (path) => CSS_EXTENSIONS.some(ext => path.endsWith(ext));

// Collect id (#foo) and class (.foo) selector names. Scans only selector
// preludes — the text before each `{` — so declaration values like `#fff`
// hex colors or `url(...)` inside a rule block are never read as selectors.
// Brace-depth-agnostic by design: nested SCSS/LESS rules still resolve because
// every prelude is delimited by `{`, `}`, or `;`.
const extractCssSkeleton = (code) => {
  const noComments = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* block */ comments
    .replace(/\/\/[^\n]*/g, ' ');        // // line comments (scss/less)

  const ids = new Set();
  const classes = new Set();
  let prelude = '';
  for (const ch of noComments) {
    if (ch === '{') {
      for (const m of prelude.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) ids.add(m[1]);
      for (const m of prelude.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) classes.add(m[1]);
      prelude = '';
    } else if (ch === '}' || ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return { ids: [...ids].sort(), classes: [...classes].sort() };
};

const formatCssSkeleton = (s) => {
  if (!s) return '';
  const lines = [];
  if (s.ids.length) lines.push(`ids: ${s.ids.join(', ')}`);
  if (s.classes.length) lines.push(`classes: ${s.classes.join(', ')}`);
  return lines.join('\n');
};

const isPascalCase = (name) => /^[A-Z][a-zA-Z0-9]*$/.test(name);

/**
 * Read lines until brackets/parens are balanced, starting from line i.
 * Delegates to shared parse-utils implementation.
 */
function readUntilBalanced(lines, i, openChar = '(', closeChar = ')') {
  return _readUntilBalanced(lines, i, openChar, closeChar);
}

const extractJsSkeleton = (code, filePath = '') => {
  const lang = detectLanguage(filePath || '.js');
  const cleaned = stripCommentsAndStrings(code, lang);
  const lines = cleaned.split('\n');
  const skeleton = {
    imports: [], components: [], functions: [],
    hooks: { useState: [], useEffect: [], useCallback: 0, useMemo: 0, useRef: 0, custom: [] },
    constants: [], classes: [], interfaces: [], types: [], namespaces: [],
  };
  const exportMap = new Map();
  // Open TS `namespace X {` blocks and top-level `const X = {` object literals:
  // members count as top level, named X.member
  const nsStack = [];
  let currentComponentName = null; // track if we're inside a component body
  let componentIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (!trimmed) continue;

    // ── Track component scope (for hook detection) ──
    if (currentComponentName !== null && indent <= componentIndent && trimmed.length > 0) {
      currentComponentName = null;
      componentIndent = -1;
    }

    // ── Imports ──
    if (trimmed.startsWith('import ')) {
      // Side-effect import: import 'foo'  or  import "foo"
      const sideEffect = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
      if (sideEffect) {
        skeleton.imports.push({ source: sideEffect[1], specifiers: [] });
        continue;
      }

      // Multi-line import: read until we find the `from` or `;`
      let fullImport = trimmed;
      let j = i;
      if (!fullImport.includes('from') && !fullImport.includes(';')) {
        const balanced = readUntilBalanced(lines, i, '{', '}');
        fullImport = balanced.text;
        j = balanced.endIndex;
        // Now find the `from` on remaining lines
        while (j < lines.length && !fullImport.includes('from')) {
          j++;
          if (j < lines.length) fullImport += ' ' + lines[j].trim();
        }
        i = j;
      }

      const fromMatch = fullImport.match(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/);
      if (fromMatch) {
        const specPart = fromMatch[1];
        const source = fromMatch[2];
        const specifiers = [];

        // default import
        const defMatch = specPart.match(/^(\w+)/);
        if (defMatch && defMatch[1] !== 'type' || (defMatch && defMatch[1] === 'type' && /^type\s+\w/.test(specPart) && !specPart.includes('{'))) {
          // `import type Foo from` or `import Foo from`
          if (defMatch[1] !== 'type') {
            specifiers.push(defMatch[1]);
          }
        }

        // namespace import
        const nsMatch = specPart.match(/\*\s+as\s+(\w+)/);
        if (nsMatch) specifiers.push(`* as ${nsMatch[1]}`);

        // named imports
        const namedMatch = specPart.match(/\{([^}]+)\}/);
        if (namedMatch) {
          const names = namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean);
          specifiers.push(...names);
        }

        skeleton.imports.push({ source, specifiers });
        continue;
      }
      continue;
    }

    // ── Exports ──
    if (trimmed.startsWith('export default ')) {
      const rest = trimmed.slice('export default '.length);
      const idMatch = rest.match(/^(\w+)/);
      if (idMatch && idMatch[1] !== 'function' && idMatch[1] !== 'class') {
        exportMap.set(idMatch[1], 'default');
      }
      // export default function Name / class Name — handled below
    }

    if (trimmed.startsWith('export {')) {
      let full = trimmed;
      if (!full.includes('}')) {
        const balanced = readUntilBalanced(lines, i, '{', '}');
        full = balanced.text;
        i = balanced.endIndex;
      }
      const inner = full.match(/\{([^}]+)\}/);
      if (inner) {
        const names = inner[1].split(',').map(s => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        }).filter(Boolean);
        for (const name of names) exportMap.set(name, 'named');
      }
      continue;
    }

    // ── Namespace scope: a line at or left of the namespace's own indent ends it ──
    while (nsStack.length && indent <= nsStack.at(-1).indent) nsStack.pop();
    const ns = nsStack.at(-1);
    if (ns && ns.memberIndent === null) ns.memberIndent = indent;

    // ── Top-level only constructs (no leading whitespace, or a namespace member) ──
    const isTopLevel = ns ? indent === ns.memberIndent : indent === 0;
    const qualify = (name) => (ns ? `${ns.name}.${name}` : name);

    // ── Object-literal members: `method(…) {`, `async method(…)`, `get x()`, `key: (…) =>`, `key: function` ──
    if (ns?.object) {
      if (indent === ns.memberIndent) {
        const method = trimmed.match(/^(async\s+)?(?:get\s+|set\s+)?(?:\*\s*)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)?/);
        const arrowProp = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:\s*(async\s+)?(?:function\b[^(]*)?\(([^)]*)\)?/);
        const m = method && !/^(if|for|while|switch|return|catch)$/.test(method[2]) ? { name: method[2], async: !!method[1], params: method[3] }
          : arrowProp && /=>|function/.test(trimmed) ? { name: arrowProp[1], async: !!arrowProp[2], params: arrowProp[3] } : null;
        if (m) skeleton.functions.push({ name: qualify(m.name), line: lineNum, params: simplifyParams(m.params ?? ''), async: m.async, exportMarker: ns.exportMarker });
      }
      continue;
    }

    // ── Namespace (TS): `export namespace Session {`, `declare module Foo.Bar {` ──
    const nsMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?(?:namespace|module)\s+([A-Za-z_$][\w$.]*)\s*\{\s*$/);
    if (nsMatch && isTopLevel) {
      const name = qualify(nsMatch[1]);
      skeleton.namespaces.push({ name, line: lineNum });
      nsStack.push({ name, indent, memberIndent: null });
      continue;
    }

    // ── Interface (TS) ──
    const ifaceMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?interface\s+(\w+)/);
    if (ifaceMatch && isTopLevel) {
      skeleton.interfaces.push({ name: qualify(ifaceMatch[1]), line: lineNum });
      continue;
    }

    // ── Type alias (TS) ──
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?type\s+(\w+)\s*[=<]/);
    if (typeMatch && isTopLevel) {
      skeleton.types.push({ name: qualify(typeMatch[1]), line: lineNum });
      continue;
    }

    // ── Class ──
    const classMatch = trimmed.match(/^(?:export\s+)?(?:export\s+default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch && isTopLevel) {
      const name = qualify(classMatch[1]);
      skeleton.classes.push({ name, line: lineNum });
      if (trimmed.includes('export')) {
        exportMap.set(name, trimmed.includes('default') ? 'default' : 'named');
      }
      continue;
    }

    // ── Function declaration ──
    const funcDeclMatch = trimmed.match(/^(?:export\s+)?(?:export\s+default\s+)?(async\s+)?function\s+(\w+)\s*(?:<[^()]*>\s*)?\(/);
    if (funcDeclMatch && isTopLevel) {
      const isAsync = !!funcDeclMatch[1];
      const bare = funcDeclMatch[2], name = qualify(bare);
      // Extract params
      let paramStr = '';
      const parenStart = line.indexOf('(');
      if (parenStart !== -1) {
        const balanced = readUntilBalanced(lines, i, '(', ')');
        const match = balanced.text.match(/\(([^)]*)\)/);
        paramStr = match ? match[1].trim() : '';
        i = balanced.endIndex;
      }
      const entry = { name, line: lineNum, params: simplifyParams(paramStr), async: isAsync };
      if (isPascalCase(bare)) {
        skeleton.components.push(entry);
        currentComponentName = name;
        componentIndent = indent;
      } else {
        skeleton.functions.push(entry);
      }
      if (trimmed.startsWith('export')) {
        exportMap.set(name, trimmed.includes('default') ? 'default' : 'named');
      }
      continue;
    }

    // ── Variable declarations (const/let/var) — top-level ──
    const varMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(.*)/);
    if (varMatch && isTopLevel) {
      const bare = varMatch[1], name = qualify(bare);
      const rhs = varMatch[2].trim();
      const isExported = trimmed.startsWith('export');

      // Arrow function or function expression
      const isArrow = /^(?:async\s+)?\(/.test(rhs) || /^(?:async\s+)?\w+\s*=>/.test(rhs);
      const isFuncExpr = /^(?:async\s+)?function/.test(rhs);

      if (isArrow || isFuncExpr) {
        const isAsync = /^async\s+/.test(rhs);
        let paramStr = '';
        if (isArrow && /^(?:async\s+)?\(/.test(rhs)) {
          const fromParen = rhs.slice(rhs.indexOf('('));
          const balanced = readUntilBalanced(lines, i, '(', ')');
          const match = balanced.text.match(/\(([^)]*)\)/);
          paramStr = match ? match[1].trim() : '';
          i = balanced.endIndex;
        } else if (isArrow) {
          const singleParam = rhs.match(/^(?:async\s+)?(\w+)\s*=>/);
          paramStr = singleParam ? singleParam[1] : '';
        } else if (isFuncExpr) {
          const balanced = readUntilBalanced(lines, i, '(', ')');
          const match = balanced.text.match(/\(([^)]*)\)/);
          paramStr = match ? match[1].trim() : '';
          i = balanced.endIndex;
        }
        const entry = { name, line: lineNum, params: simplifyParams(paramStr), async: isAsync };
        if (isPascalCase(bare)) {
          skeleton.components.push(entry);
          currentComponentName = name;
          componentIndent = indent;
        } else {
          skeleton.functions.push(entry);
        }
        if (isExported) exportMap.set(name, 'named');
        continue;
      }

      // HOC: memo(...), forwardRef(...), lazy(...)
      const hocMatch = rhs.match(/^(?:React\.)?(memo|forwardRef|lazy)\s*\(/);
      if (hocMatch) {
        skeleton.components.push({ name, line: lineNum, hoc: hocMatch[1], params: '?', async: false });
        currentComponentName = name;
        componentIndent = indent;
        if (isExported) exportMap.set(name, 'named');
        continue;
      }

      // createContext
      if (/(?:React\.)?createContext\s*\(/.test(rhs)) {
        skeleton.contexts = skeleton.contexts || [];
        skeleton.contexts.push({ name, line: lineNum });
        if (isExported) exportMap.set(name, 'named');
        continue;
      }

      // Plain constant
      skeleton.constants.push({ name, line: lineNum });
      if (isExported) exportMap.set(name, 'named');
      // An object literal opened on this line: index its methods as name.method
      if (/^\{\s*$/.test(rhs)) nsStack.push({ name, indent, memberIndent: null, object: true, exportMarker: isExported ? '+' : undefined });
      continue;
    }

    // ── Hooks (inside component bodies) ──
    if (currentComponentName !== null && indent > componentIndent) {
      // useState
      const useStateMatch = trimmed.match(/(?:const|let|var)\s+\[(\w+)/);
      if (useStateMatch && trimmed.includes('useState(')) {
        skeleton.hooks.useState.push(useStateMatch[1]);
        continue;
      }

      // useEffect — use readUntilBalanced for reliable paren matching
      if (/useEffect\s*\(/.test(trimmed)) {
        const balanced = readUntilBalanced(lines, i, '(', ')');
        const depsChunk = balanced.text;
        // Look for dependency array: , [...]) at end
        const depsMatch = depsChunk.match(/,\s*\[([^\]]*)\]\s*\)\s*;?\s*$/);
        if (depsMatch) {
          const depsStr = depsMatch[1].trim();
          const deps = depsStr ? depsStr.split(',').map(d => d.trim()).filter(Boolean) : [];
          skeleton.hooks.useEffect.push({ line: lineNum, deps });
        } else {
          skeleton.hooks.useEffect.push({ line: lineNum, deps: '?' });
        }
        continue;
      }

      // useCallback, useMemo, useRef
      if (/useCallback\s*\(/.test(trimmed)) { skeleton.hooks.useCallback++; continue; }
      if (/useMemo\s*\(/.test(trimmed)) { skeleton.hooks.useMemo++; continue; }
      if (/useRef\s*\(/.test(trimmed)) { skeleton.hooks.useRef++; continue; }

      // Custom hooks (use\w+)
      const customHookMatch = trimmed.match(/\b(use[A-Z]\w*)\s*\(/);
      if (customHookMatch) {
        const hookName = customHookMatch[1];
        if (!['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'].includes(hookName)) {
          if (!skeleton.hooks.custom.includes(hookName)) skeleton.hooks.custom.push(hookName);
        }
        continue;
      }
    }
  }

  // Apply export markers
  for (const entry of [...skeleton.components, ...skeleton.functions, ...skeleton.classes]) {
    const exportType = exportMap.get(entry.name);
    if (exportType === 'default') entry.exportMarker = '*';
    else if (exportType === 'named') entry.exportMarker = '+';
  }
  return skeleton;
};

/** Simplify a parameter string — strip type annotations for brevity (generic-aware) */
function simplifyParams(paramStr) {
  if (!paramStr) return '';
  return simplifyTypeAnnotation(paramStr).replace(/,\s*$/, ''); // trailing comma of a multi-line list
}

const formatBabelSkeleton = (skeleton) => {
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
  if (skeleton.components.length > 0) {
    lines.push(`components: ${skeleton.components.map(c => {
      const marker = c.exportMarker || '';
      const params = c.params !== undefined ? `(${c.params})` : '';
      const hoc = c.hoc ? `(${c.hoc})` : '';
      return `${c.name}${hoc}${params}${marker}:${c.line}`;
    }).join(', ')}`);
  }
  if (skeleton.contexts?.length > 0) lines.push(`contexts: ${skeleton.contexts.map(c => `${c.name}:${c.line}`).join(', ')}`);
  if (skeleton.functions.length > 0) {
    for (const f of skeleton.functions) {
      const marker = f.exportMarker || '';
      const asyncPrefix = f.async ? 'async ' : '';
      lines.push(`fn: ${asyncPrefix}${f.name}(${f.params || ''})${marker}:${f.line}`);
    }
  }
  if (skeleton.constants.length > 0) {
    lines.push(formatConstants(skeleton.constants));
  }
  const hookParts = [];
  if (skeleton.hooks.useState.length > 0) hookParts.push(`useState: ${skeleton.hooks.useState.join(', ')}`);
  if (skeleton.hooks.useCallback > 0) hookParts.push(`useCallback(${skeleton.hooks.useCallback})`);
  if (skeleton.hooks.useMemo > 0) hookParts.push(`useMemo(${skeleton.hooks.useMemo})`);
  if (skeleton.hooks.useRef > 0) hookParts.push(`useRef(${skeleton.hooks.useRef})`);
  if (skeleton.hooks.custom.length > 0) hookParts.push(...skeleton.hooks.custom);
  if (skeleton.hooks.useEffect.length > 0) {
    hookParts.push(...skeleton.hooks.useEffect.map(e => e.deps === null ? 'useEffect(∞)' : e.deps === '?' ? 'useEffect(?)' : `useEffect([${e.deps.join(',')}])`));
  }
  if (hookParts.length > 0) lines.push(`hooks: ${hookParts.join(', ')}`);
  if (skeleton.namespaces?.length > 0) lines.push(`namespaces: ${skeleton.namespaces.map(n => `${n.name}:${n.line}`).join(', ')}`);
  if (skeleton.classes.length > 0) lines.push(`classes: ${skeleton.classes.map(c => `${c.name}${c.exportMarker || ''}:${c.line}`).join(', ')}`);
  if (skeleton.interfaces.length > 0 || skeleton.types.length > 0) {
    lines.push(`types: ${[...skeleton.interfaces, ...skeleton.types].map(t => `${t.name}:${t.line}`).join(', ')}`);
  }
  return lines.join('\n');
};

// ── Formatter ──

const estimateTokens = (text) => text ? Math.ceil(text.length / 4) : 0;
const formatTokenCount = (count) => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

const RESOLVE_SUFFIXES = ['', ...JS_EXTENSIONS, ...JS_EXTENSIONS.map(e => `/index${e}`)];

// Resolve a relative or tsconfig-aliased JS import to a known project file
// (relativePath), or null. TS ESM imports name the emitted file (`./x.js`) while
// the source is `x.ts`. Package-name imports stay unresolved.
const resolveImport = (fromPath, source, known, aliasesFor) => {
  let bases;
  if (source.startsWith('.')) bases = [posix.normalize(posix.join(posix.dirname(fromPath), source))];
  else {
    const alias = (aliasesFor?.(fromPath) ?? []).find(a => a.star
      ? source.length >= a.prefix.length + a.suffix.length && source.startsWith(a.prefix) && source.endsWith(a.suffix)
      : source === a.prefix);
    if (!alias) return null;
    const mid = alias.star ? source.slice(alias.prefix.length, source.length - alias.suffix.length) : '';
    bases = alias.targets.map(t => posix.normalize(t.replace('*', mid)));
  }
  for (const base of bases) {
    for (const b of [base, base.replace(/\.(m|c)?jsx?$/, '')]) {
      for (const suffix of RESOLVE_SUFFIXES) {
        if (known.has(b + suffix)) return b + suffix;
      }
    }
  }
  return null;
};

// tsconfig/jsconfig `paths` aliases (`@/*` → `src/*`) as a per-file lookup: the
// nearest config above the importing file applies (relative `extends` followed,
// a config's own `paths` replacing inherited ones, as in TypeScript). Patterns
// are tried longest prefix first; targets become repo-relative paths.
const parseJsonc = (text) => JSON.parse(text
  .replace(/\/\*[\s\S]*?\*\/|("(?:\\.|[^"\\])*")|\/\/[^\n]*/g, (m, str) => str ?? '')
  .replace(/,(\s*[}\]])/g, '$1'));
const loadAliases = (rootPath) => {
  const readConfig = (file, depth = 0) => {
    try {
      const json = parseJsonc(readFileSync(file, 'utf-8'));
      const opts = json.compilerOptions ?? {};
      if (!opts.paths || typeof opts.paths !== 'object') {
        if (typeof json.extends !== 'string' || !json.extends.startsWith('.') || depth >= 5) return null;
        const ext = resolve(dirname(file), json.extends);
        return readConfig(ext.endsWith('.json') ? ext : `${ext}.json`, depth + 1);
      }
      const baseDir = resolve(dirname(file), opts.baseUrl ?? '.');
      return Object.entries(opts.paths).filter(([, t]) => Array.isArray(t)).map(([pattern, targets]) => {
        const star = pattern.indexOf('*');
        return {
          star: star >= 0, prefix: star >= 0 ? pattern.slice(0, star) : pattern, suffix: star >= 0 ? pattern.slice(star + 1) : '',
          targets: targets.map(t => relative(rootPath, resolve(baseDir, t)).split(sep).join('/')),
        };
      }).sort((a, b) => b.prefix.length - a.prefix.length);
    } catch { return null; }
  };
  const byDir = new Map();
  const forDir = (dir) => {
    if (byDir.has(dir)) return byDir.get(dir);
    let found;
    const config = ['tsconfig.json', 'jsconfig.json'].map(n => join(rootPath, dir, n)).find(f => existsSync(f));
    if (config) found = readConfig(config) ?? [];
    else found = dir === '.' || dir === '' ? [] : forDir(posix.dirname(dir));
    byDir.set(dir, found);
    return found;
  };
  return (fromPath) => forDir(posix.dirname(fromPath));
};

// Import/re-export/dynamic-import specifiers, read from raw source (the skeleton
// parser runs on string-stripped code, so it cannot see module paths).
const IMPORT_SOURCE_RE = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
const extractImportSources = (code) => [...code.matchAll(IMPORT_SOURCE_RE)].map(m => m[1] || m[2] || m[3]);

// Bindings a static import/re-export brings in, by source, read from raw source:
// default, `* as X`, `{ a, b as c, type d }`. `name` is the exporter's spelling
// (what a grep for the definition matches), `local` how this file refers to it
// (none for re-exports, which this file never uses).
const IMPORT_CLAUSE_RE = /\b(import|export)\s+(?:type\s+)?([\w$*{}\s,]*?)\s*\bfrom\s*['"]([^'"]+)['"]/g;
const extractImportBindings = (code) => {
  const bySource = {};
  for (const [, kw, clause, source] of code.matchAll(IMPORT_CLAUSE_RE)) {
    const list = bySource[source] ??= [];
    const add = (name, local) => { if (name && !list.some(b => b.name === name)) list.push({ name, local: kw === 'import' ? local : null }); };
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) for (const part of braces[1].split(',')) {
      const [orig, alias] = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).map(s => s?.trim());
      add(orig, alias || orig);
    }
    const outside = clause.replace(/\{[^}]*\}/, '');
    const star = outside.match(/\*\s*as\s+([\w$]+)/);
    if (star) add(star[1], star[1]);
    const def = outside.replace(/\*\s*as\s+[\w$]+/, '').match(/^\s*([\w$]+)/);
    if (def && kw === 'import') add(def[1], def[1]);
  }
  return bySource;
};

// What each import is used for, by source, as grep-ready names with the lines
// that use them: `Instance.containsPath:5,9` for members of an imported
// namespace/object, `delay:12` for the binding itself, the bare name when this
// file never uses it (types, re-exports). Import statements are blanked first
// so they don't count as uses; past USE_LINES lines a name ends in `…`.
const USE_LINES = 3;

// The declaration enclosing each line (1-based), as `Ns.fn` / `Class.method` /
// `fn`, so a use can be reported as `434@File.read` — the "which function calls
// it" half of a callers question. Scans comment/string-stripped code: a
// declaration opening a bracket is pushed until its bracket depth closes again;
// namespaces, classes and object literals prefix their members.
const DECL_RE = /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:(namespace|module|class|function\*?)\s+([\w$.]+)|(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=)/;
const METHOD_RE = /^\s*(?:(?:public|private|protected|static|readonly|override|async|get|set)\s+)*\*?([\w$]+)\s*(?:<[^>]*>)?\s*\(/;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'function', 'await', 'typeof', 'new', 'super', 'import']);
const enclosingByLine = (code) => {
  const lines = code.split('\n');
  const out = new Array(lines.length + 1).fill(null);
  const stack = []; // { name, depth, container }
  let depth = 0;
  lines.forEach((line, i) => {
    const top = stack.at(-1);
    let name = null, container = false;
    const decl = line.match(DECL_RE);
    if (decl) { name = decl[2] ?? decl[3]; container = !!decl[1] && decl[1] !== 'function' && decl[1] !== 'function*'; }
    else if (top?.container || top?.object) {
      const m = line.match(METHOD_RE);
      if (m && !NOT_METHODS.has(m[1])) name = m[1];
    }
    if (name && (decl?.[3]) && /=\s*\{\s*$/.test(line)) container = 'object'; // `const X = {` holds methods
    const qualified = name && stack.length && stack.every(s => s.container) ? `${stack.map(s => s.name).join('.')}.${name}` : name;
    let d = depth;
    for (const c of line) { if ('{(['.includes(c)) d++; else if ('})]'.includes(c)) d--; }
    if (name && d > depth) stack.push({ name: qualified, depth, container: !!container, object: container === 'object' });
    // Report the outermost function/const (`BashTool`, `File.read`), not a helper
    // nested in it; inside an object literal but no method, the object itself
    // A one-line declaration (`const SettingsDialog = lazyNamed(…)`) encloses its own line
    const oneLine = name && decl && d <= depth ? qualified : null;
    out[i + 1] = stack.find(s => !s.container)?.name ?? oneLine ?? stack.filter(s => s.object).at(-1)?.name ?? null;
    depth = d;
    while (stack.length && depth <= stack.at(-1).depth) stack.pop();
  });
  return out;
};

const extractImportNames = (code) => {
  const blanked = code.replace(new RegExp(IMPORT_CLAUSE_RE.source, 'g'), m => m.replace(/[^\n]/g, ' '));
  const lines = stripCommentsAndStrings(blanked, 'js').split('\n');
  const enclosing = enclosingByLine(lines.join('\n'));
  const fmt = (label, at) => {
    const ns = [...new Set(at)];
    const at1 = (n) => enclosing[n] ? `${n}@${enclosing[n]}` : `${n}`;
    return `${label}:${ns.slice(0, USE_LINES).map(at1).join(',')}${ns.length > USE_LINES ? ',…' : ''}`;
  };
  const bySource = {};
  for (const [source, bindings] of Object.entries(extractImportBindings(code))) {
    bySource[source] = bindings.flatMap(({ name, local }) => {
      if (!local) return [name];
      const esc = local.replace(/\$/g, '\\$');
      const re = new RegExp(`(?<![\\w$.])${esc}\\??\\.\\s*([A-Za-z_$][\\w$]*)|(?<![\\w$.])${esc}(?![\\w$])`, 'g');
      const members = new Map(), bare = [];
      lines.forEach((l, i) => {
        if (!l.includes(local)) return; // cheap prefilter: most lines never mention it
        for (const m of l.matchAll(re)) {
          if (!m[1]) { bare.push(i + 1); continue; }
          if (!members.has(m[1])) members.set(m[1], []);
          members.get(m[1]).push(i + 1);
        }
      });
      const out = [...members].map(([member, at]) => fmt(`${name}.${member}`, at));
      if (bare.length) out.push(fmt(name, bare));
      return out.length ? out : [name];
    });
  }
  return bySource;
};

// Reverse import index: file → [{ from, names }] of the files importing it.
// Emitted as `path: used-by: importer (Name.member:line, …)` lines so one grep
// for a symbol answers "who calls X, and on which line".
const buildUsedBy = (results, aliasesFor) => {
  const known = new Set(results.map(r => r.relativePath));
  const usedBy = new Map();
  for (const r of results) {
    if (!r.importSources) continue;
    const seen = new Set();
    for (const src of r.importSources) {
      const target = resolveImport(r.relativePath, src, known, aliasesFor);
      if (!target || target === r.relativePath || seen.has(target)) continue;
      seen.add(target);
      if (!usedBy.has(target)) usedBy.set(target, []);
      usedBy.get(target).push({ from: r.relativePath, names: r.importNames?.[src] ?? [] });
    }
  }
  return usedBy;
};
// One line per importer, so a grep returns only the importers that match it
// (not a whole list that happens to contain the term). Uncapped: a capped list
// silently drops callers, while the grep cap already bounds what a reader sees.
// An importer using many members gets several lines, each under the grep line
// cap (guard-explore.sh cuts lines at 300 chars), so a grep for any member
// returns a whole line naming it.
const USED_BY_LINE_MAX = 290;
const formatUsedBy = (path, importers) => [...importers]
  .sort((a, b) => a.from.localeCompare(b.from))
  .flatMap((i) => {
    const prefix = `${path}: used-by: ${i.from}`;
    if (!i.names.length) return [prefix];
    const lines = [];
    let chunk = [];
    for (const name of i.names) {
      if (chunk.length && `${prefix} (${[...chunk, name].join(', ')})`.length > USED_BY_LINE_MAX) { lines.push(chunk); chunk = []; }
      chunk.push(name);
    }
    lines.push(chunk);
    return lines.map(c => `${prefix} (${c.join(', ')})`);
  })
  .join('\n');

const rankHubs = (results, aliasesFor) => {
  const known = new Set(results.map(r => r.relativePath));
  const counts = new Map();
  for (const r of results) {
    if (!r.importSources) continue;
    const targets = new Set(r.importSources.map(src => resolveImport(r.relativePath, src, known, aliasesFor)).filter(Boolean));
    for (const t of targets) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .filter(h => h.count > 1)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
};

// Root-level or src/-level only: a nested index.js is a barrel, not an entry point.
const CONVENTIONAL_ENTRIES = /^(src\/)?(main|index|app|server|cli)\.(m?[jt]sx?|py)$|(^|\/)src\/(main|lib)\.rs$|(^|\/)(__main__|manage)\.py$|(^|\/)Program\.cs$/;

const findEntryPoints = (results, meta) => {
  const known = new Set(results.map(r => r.relativePath));
  const found = [];
  const add = (p) => { if (p && known.has(p) && !found.includes(p)) found.push(p); };
  for (const p of meta.declared) add(p);
  // Conventional names, shallowest first, skipping deep copies (e.g. fixtures).
  results
    .map(r => r.relativePath)
    .filter(p => CONVENTIONAL_ENTRIES.test(p) && p.split('/').length <= 4)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .forEach(add);
  return found.slice(0, 6);
};

// Entry files declared by the project itself (index.html, package.json).
const readProjectMeta = (rootPath) => {
  const declared = [];
  const norm = (p) => p.replace(/^\.?\//, '');
  try {
    const html = readFileSync(join(rootPath, 'index.html'), 'utf-8');
    for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
      if (!/^https?:/.test(m[1])) declared.push(norm(m[1]));
    }
  } catch {}
  try {
    const pkg = JSON.parse(readFileSync(join(rootPath, 'package.json'), 'utf-8'));
    for (const key of ['main', 'module']) if (typeof pkg[key] === 'string') declared.push(norm(pkg[key]));
    if (typeof pkg.bin === 'string') declared.push(norm(pkg.bin));
    else if (pkg.bin && typeof pkg.bin === 'object') declared.push(...Object.values(pkg.bin).map(norm));
  } catch {}
  return { declared };
};

// Split at top-level commas (not inside (), [], {}, <>; `=>` is not a bracket)
const splitItems = (text) => {
  const items = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{<'.includes(c)) depth++;
    else if (')]}'.includes(c) || (c === '>' && text[i - 1] !== '=')) depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) { items.push(text.slice(start, i).trim()); start = i + 1; }
  }
  items.push(text.slice(start).trim());
  return items.filter(Boolean);
};

// Make every grep hit say where to read: one line per symbol that has a line
// number, as `path:line: kind: symbol` (grep -n style, so the hit is a ready Read
// target), or `path:start-end:` when the symbol spans several lines, so the Read
// can take exactly that range. Lines with no line numbers (imports, hooks,
// package.json fields) keep their content behind a `path: ` prefix.
const ITEM_LINE_RE = /:(\d+)(?=$|\s)/;
const locateLines = (path, formatted, spans = {}) => {
  const out = [];
  for (const raw of formatted.split('\n')) {
    const m = raw.match(/^([a-z][a-z ]*):\s(.*)$/);
    const [kind, body] = m ? [m[1], m[2]] : [null, raw];
    const items = m ? splitItems(body) : [body];
    const withLine = items.filter(it => ITEM_LINE_RE.test(it));
    if (withLine.length === 0) { out.push(`${path}: ${raw}`); continue; }
    for (const it of withLine) {
      const line = it.match(ITEM_LINE_RE)[1];
      const loc = spans?.[line] ? `${line}-${spans[line]}` : line;
      out.push(`${path}:${loc}: ${kind ? `${kind}: ` : ''}${it.replace(ITEM_LINE_RE, '')}`);
    }
    const rest = items.filter(it => !ITEM_LINE_RE.test(it));
    if (rest.length) out.push(`${path}: ${kind ? `${kind}: ` : ''}${rest.join(', ')}`);
  }
  return out.join('\n');
};

const formatOutput = (results, projectMeta = { declared: [] }, aliasesFor = null) => {
  const lines = [];

  // Entry points: where execution starts (index.html module scripts, package.json
  // main/module/bin, conventional main files). Hubs: most-imported local files —
  // the ones with the widest blast radius. One per line, so grepping a file name
  // returns its own entry/hub line, not the whole list.
  const entries = findEntryPoints(results, projectMeta);
  if (entries.length > 0) {
    lines.push(`## Entry Points`);
    lines.push(...entries.map(p => `${p}: entry point`));
  }
  const hubs = rankHubs(results, aliasesFor).slice(0, 8);
  if (hubs.length > 0) {
    lines.push(`## Hubs (most imported)`);
    lines.push(...hubs.map(h => `${h.path}: hub: imported by ${h.count} files`));
  }

  const usedBy = buildUsedBy(results, aliasesFor);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const result of results) {
    lines.push(`## ${result.relativePath}`);
    if (result.formatted) lines.push(locateLines(result.relativePath, result.formatted, result.spans));
    if (usedBy.has(result.relativePath)) lines.push(formatUsedBy(result.relativePath, usedBy.get(result.relativePath)));
  }
  return lines.join('\n');
};

// ── Walker ──

const isIndexable = (path) => isJsParseable(path) || isPythonParseable(path) || isCSharpParseable(path) || isRustParseable(path) || isPackageJson(path) || isMarkdownParseable(path) || isCssParseable(path);

// Filesystem walk: used outside git, or when git lists nothing usable.
// Returns { path, relativePath } objects filtered by the per-language predicates
// above (the shared collectFiles in parse-utils.js returns plain path strings).
function walkFiles(dir, rootDir = dir, files = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) walkFiles(fullPath, rootDir, files); }
    else if (entry.isFile() && isIndexable(fullPath)) {
      files.push({ path: fullPath, relativePath: fullPath.slice(rootDir.length + 1) });
    }
  }
  return files;
}

// Inside a git work tree, list tracked + untracked-but-not-ignored files, so
// .gitignore'd output (vendored code, generated files) is never indexed. The same
// directory rules as the walk apply on top, keeping both modes consistent.
// Returns null to request the filesystem walk (no git, or rootPath is ignored).
function gitFiles(rootPath) {
  let out;
  try {
    const git = (...a) => execFileSync('git', a, { cwd: rootPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
    if (git('rev-parse', '--is-inside-work-tree').trim() !== 'true') return null;
    try { git('check-ignore', '-q', '.'); return null; } catch {} // exit 1 → rootPath not ignored
    out = git('ls-files', '-z', '--cached', '--others', '--exclude-standard');
  } catch { return null; }
  const files = [];
  for (const rel of new Set(out.split('\0'))) {
    if (!rel || !isIndexable(rel)) continue;
    const parts = rel.split('/');
    if (parts.slice(0, -1).some(d => SKIP_DIRECTORIES.has(d) || d.startsWith('.'))) continue;
    files.push({ path: join(rootPath, ...parts), relativePath: rel });
  }
  return files.length > 0 ? files : null;
}

const collectFiles = (rootPath) => gitFiles(rootPath) ?? walkFiles(rootPath).map(f => ({ ...f, relativePath: f.relativePath.split(sep).join('/') }));

// ── Per-file cache ──
// Each file's formatted section is cached by path, mtime and size, so a refresh
// after a one-file edit re-parses one file instead of the whole project. Entries
// are invalidated wholesale when the parser source itself changes.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_VERSION = createHash('sha1')
  .update(readFileSync(join(SCRIPT_DIR, 'compaction.js')))
  .update(readFileSync(join(SCRIPT_DIR, 'parse-utils.js')))
  .digest('hex');

function loadCache(cachePath) {
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (cache.version === PARSER_VERSION && cache.files && typeof cache.files === 'object') return cache.files;
  } catch {}
  return {};
}

function saveCache(cachePath, files) {
  const tmp = `${cachePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ version: PARSER_VERSION, files }));
    renameSync(tmp, cachePath); // atomic: a concurrent run never reads half a cache
  } catch { try { unlinkSync(tmp); } catch {} }
}

// ── Symbol spans ──
// The last line of the symbol that starts on a given line, so a hit reads as
// path:start-end. A heuristic, not a parser: brackets are counted outside
// strings, comments and (JS) regex literals. A symbol that never closes within
// SPAN_SCAN_MAX lines gets no end, and its hit stays path:line.
const SPAN_SCAN_MAX = 5000;
// JS/TS: a line at bracket depth 0 ends the statement unless it ends in, or the
// next line starts with, something that carries it on (ASI-style).
const JS_CONTINUES_AFTER = /(?:[=(\[{+\-*\/%&|^!?:<>.]|=>|\b(?:extends|implements))$/;
const JS_CONTINUES_BEFORE = /^(?:[{.?:)\]+\-*\/%&|^=<>]|=>|(?:extends|implements)\b)/;
const REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|new|delete|void|throw|else|yield|await))\s*$/;

// JS/TS, C# and Rust. Ends at a `;` at depth 0 or (JS) a line ending in `,` at
// depth 0 (an object member; mid-line commas may sit in `<A, B>` generics, which
// are not counted), at a closer that would go below depth 0 (the end of the
// enclosing block: the symbol ended on the line before), and — for C#/Rust,
// where headers often break before `{` — when the first depth-0 `{` closes.
const symbolEndBrace = (lines, start, lang) => {
  const js = lang === 'js';
  let depth = 0, quote = null, block = false, lastCode = start;
  const tpl = []; // depth at each open `${` of a template literal
  for (let n = start; n < lines.length && n < start + SPAN_SCAN_MAX; n++) {
    const line = lines[n];
    let code = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i], next = line[i + 1];
      if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
      if (quote) {
        if (quote === '@') { if (c === '"') { if (next === '"') i++; else quote = null; } continue; }
        if (quote.length > 1) { if (line.startsWith(quote, i)) { i += quote.length - 1; quote = null; } continue; }
        if (c === '\\') { i++; continue; }
        if (quote === '`' && c === '$' && next === '{') { tpl.push(depth); depth++; quote = null; i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '/' && next === '/') break;
      if (c === '/' && next === '*') { block = true; i++; continue; }
      if (c === '"' || (c === '`' && js) || (c === "'" && lang !== 'rs')) {
        quote = c === '"' && lang === 'cs' && /@\$?$|\$@$/.test(line.slice(0, i)) ? '@' : c;
        code += '0';
        continue;
      }
      if (lang === 'rs' && c === "'") { // char literal, or a lifetime ('a) to step over
        const ch = line.slice(i).match(/^'(?:\\[^']*|[^\\'])'/);
        if (ch) { i += ch[0].length - 1; code += '0'; }
        continue;
      }
      if (lang === 'rs' && c === 'r' && !/\w/.test(line[i - 1] || '')) {
        const raw = line.slice(i).match(/^r(#*)"/);
        if (raw) { quote = `"${raw[1]}`; i += raw[0].length - 1; code += '0'; continue; }
      }
      if (js && c === '/' && REGEX_AFTER.test(code)) {
        const re = line.slice(i).match(/^\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\[])+\//);
        if (re) { i += re[0].length - 1; code += '0'; continue; }
      }
      if (c === '(' || c === '[' || c === '{') { depth++; code += c; continue; }
      if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) return code.trim() ? n : lastCode;
        depth--;
        if (c === '}' && tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); quote = '`'; continue; }
        if (c === '}' && depth === 0 && !js) return n;
        code += c;
        continue;
      }
      if (c === ';' && depth === 0) return n;
      code += c;
    }
    const tail = code.trimEnd();
    if (tail) lastCode = n;
    if (!js || depth || quote || block || !tail) continue;
    if (tail.endsWith(',')) return n;
    if (JS_CONTINUES_AFTER.test(tail)) continue;
    const following = lines.slice(n + 1, n + 20).map(l => l.trim()).find(l => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
    if (!following || !JS_CONTINUES_BEFORE.test(following)) return n;
  }
  return null;
};

// One Python line: tracks bracket depth and open (triple-)quoted strings across
// lines; returns the line's code with strings as `0` and the comment dropped.
const scanPythonLine = (line, st) => {
  let code = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (st.quote) {
      if (c === '\\') { i++; continue; }
      if (line.startsWith(st.quote, i)) { i += st.quote.length - 1; st.quote = null; }
      continue;
    }
    if (c === '#') break;
    if (c === '"' || c === "'") {
      st.quote = line.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      i += st.quote.length - 1;
      code += '0';
      continue;
    }
    if ('([{'.includes(c)) st.depth++;
    else if (')]}'.includes(c)) st.depth = Math.max(0, st.depth - 1);
    code += c;
  }
  if (st.quote?.length === 1) st.quote = null; // a single-quoted string never spans lines
  return code;
};

// Python: the (possibly multi-line) header, then — when it opens a block — every
// following line indented deeper than the header, skipping blank/comment lines.
const symbolEndPython = (lines, start) => {
  const indentOf = (l) => l.length - l.trimStart().length;
  const base = indentOf(lines[start]);
  const st = { depth: 0, quote: null };
  let n = start, code = '';
  for (; n < lines.length && n < start + SPAN_SCAN_MAX; n++) {
    code = scanPythonLine(lines[n], st).trimEnd();
    if (!st.depth && !st.quote && !code.endsWith('\\')) break;
  }
  if (n >= lines.length || n >= start + SPAN_SCAN_MAX) return null;
  if (!code.endsWith(':')) return n;
  let end = n;
  for (let k = n + 1; k < lines.length; k++) {
    const inString = st.quote;
    const c = scanPythonLine(lines[k], st).trim();
    if (inString) { end = k; continue; }
    if (!c) continue;
    if (indentOf(lines[k]) <= base) break;
    end = k;
  }
  return end;
};

const spanLang = (path) => isPythonParseable(path) ? 'py' : isJsParseable(path) ? 'js'
  : isCSharpParseable(path) ? 'cs' : isRustParseable(path) ? 'rs' : null;

// { startLine: endLine } (1-based) for every multi-line symbol named in `formatted`.
const symbolSpans = (formatted, content, lang) => {
  const spans = {};
  if (!formatted || !lang) return spans;
  const lines = content.split('\n');
  for (const m of formatted.matchAll(/:(\d+)(?=$|[\s,])/gm)) {
    const start = Number(m[1]);
    if (start in spans || start < 1 || start > lines.length) continue;
    const end = lang === 'py' ? symbolEndPython(lines, start - 1) : symbolEndBrace(lines, start - 1, lang);
    if (end !== null && end + 1 > start) spans[start] = end + 1;
  }
  return spans;
};

// Parse one file into its formatted section and the import specifiers hubs need
function compactFile(path, content) {
  const [extract, format] =
    isPythonParseable(path) ? [extractPythonSkeleton, formatPythonSkeleton]
    : isJsParseable(path) ? [extractJsSkeleton, formatBabelSkeleton]
    : isCSharpParseable(path) ? [extractCSharpSkeleton, formatCSharpSkeleton]
    : isRustParseable(path) ? [extractRustSkeleton, formatRustSkeleton]
    : isPackageJson(path) ? [extractPackageJsonSkeleton, formatPackageJsonSkeleton]
    : isCssParseable(path) ? [extractCssSkeleton, formatCssSkeleton]
    : [extractMarkdownTitle, (sk) => sk.title];
  const skeleton = extract(content, path);
  const formatted = skeleton ? format(skeleton) : null;
  return {
    formatted: formatted || null,
    spans: symbolSpans(formatted, content, spanLang(path)),
    importSources: isJsParseable(path) ? extractImportSources(content) : null,
    importNames: isJsParseable(path) ? extractImportNames(content) : null,
    tokens: estimateTokens(content),
  };
}

// ── Main ──

function compactProject(rootPath, cachePath) {
  const files = collectFiles(rootPath);
  const cached = cachePath ? loadCache(cachePath) : {};
  const nextCache = {};
  const results = [];
  let rawTokens = 0, reused = 0, parsed = 0;
  for (const file of files) {
    let st;
    try { st = lstatSync(file.path); } catch { continue; } // deleted but still tracked
    if (!st.isFile()) continue; // symlinks, submodules
    let entry = cached[file.relativePath];
    if (entry && entry.mtimeMs === st.mtimeMs && entry.size === st.size) {
      reused++;
    } else {
      try {
        entry = { mtimeMs: st.mtimeMs, size: st.size, ...compactFile(file.path, readFileSync(file.path, 'utf-8')) };
        parsed++;
      } catch { continue; }
    }
    nextCache[file.relativePath] = entry;
    rawTokens += entry.tokens;
    results.push({ relativePath: file.relativePath, formatted: entry.formatted, spans: entry.spans, importSources: entry.importSources, importNames: entry.importNames });
  }
  if (cachePath) saveCache(cachePath, nextCache);
  const output = formatOutput(results, readProjectMeta(rootPath), loadAliases(rootPath));
  return { output, stats: { files: results.length, rawTokens, compactedTokens: estimateTokens(output), parsed, reused } };
}

const args = process.argv.slice(2);
let targetPath = process.cwd();
let jsonOutput = false;

for (const arg of args) {
  if (arg === '--json') jsonOutput = true;
  else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: node compaction.js [path] [--json]\n\nCompact a JS/TS/Python/C#/Rust project into a structural skeleton.\nAlso indexes package.json (name/scripts/deps), CSS/SCSS/LESS (ids/classes),\nand lists .md files by path with their first heading.\nIn a git repo, indexes tracked and untracked files and skips .gitignore'd ones.\nRe-parses only files changed since the last run (cache: .orchestration/tools/.compaction_cache.json).\nZero dependencies — only requires Node.js.`);
    process.exit(0);
  } else if (!arg.startsWith('-')) targetPath = arg;
}

targetPath = resolve(targetPath);
const dirName = basename(targetPath);
const outDir = join(targetPath, '.orchestration', 'tools');
mkdirSync(outDir, { recursive: true });
const { output, stats } = compactProject(targetPath, join(outDir, '.compaction_cache.json'));
const filename = `compacted_${dirName}_${getDateStamp()}.md`;
const outputPath = join(outDir, filename);
const sha = getGitSha(targetPath);
const outputWithSha = `git-sha: ${sha}\n${output}`;

writeFileSync(outputPath, jsonOutput ? JSON.stringify({ output: outputWithSha, stats }, null, 2) : outputWithSha);

// Keep exactly one artifact per project so `compacted_*.md` globs never match a stale copy.
for (const name of readdirSync(outDir)) {
  if (name !== filename && name.startsWith(`compacted_${dirName}_`) && name.endsWith('.md')) {
    try { unlinkSync(join(outDir, name)); } catch {}
  }
}

const rate = stats.rawTokens > 0 ? ((1 - stats.compactedTokens / stats.rawTokens) * 100).toFixed(1) : '0';
console.log(`\nCompaction complete!\n`);
console.log(`  Saved to: ${outputPath}\n`);
console.log(`  Files:            ${stats.files} (${stats.parsed} parsed, ${stats.reused} cached)`);
console.log(`  Project tokens:   ${formatTokenCount(stats.rawTokens)}`);
console.log(`  Compacted tokens: ${formatTokenCount(stats.compactedTokens)}`);
console.log(`  Compaction rate:  ${rate}%`);
