#!/usr/bin/env node
/**
 * Token Savings Benchmark
 *
 * Measures how much the Babel parser reduces token usage by comparing:
 * - Raw file content (what you'd send without optimization)
 * - Parsed output (signatures or skeleton)
 *
 * Usage: node scripts/benchmark-tokens.js [path]
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  isBabelParseable,
  extractSignatures,
  extractSkeleton,
  formatSignaturesForPrompt,
  formatSkeletonForPrompt,
} from '../src/utils/babelSymbolParser.js';

// Token estimation (code averages ~3.5 chars per token)
const tokenCount = (text) => Math.ceil((text || '').length / 3.5);

// Thresholds for optimization modes
const THRESHOLDS = {
  SIGNATURES: 1000,  // 1000+ tokens: use signatures
  SKELETON: 3000,    // 3000+ tokens: use skeleton
};

const SKIP_DIRS = ['node_modules', 'dist', '.git', 'target', 'build', '.next', '.turbo', 'out', 'coverage', '.cache', '__pycache__'];

function collectFiles(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
        collectFiles(fullPath, files);
      }
    } else if (entry.isFile() && isBabelParseable(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function analyzeFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const rawTokens = tokenCount(content);

  const signatures = extractSignatures(content, filePath);
  const skeleton = extractSkeleton(content, filePath);

  const signaturesText = formatSignaturesForPrompt(signatures);
  const skeletonText = formatSkeletonForPrompt(skeleton);

  const sigTokens = tokenCount(signaturesText);
  const skelTokens = tokenCount(skeletonText);

  return {
    path: filePath,
    rawTokens,
    sigTokens,
    skelTokens,
    symbolCount: signatures.length,
  };
}

function getMode(tokens) {
  if (tokens < THRESHOLDS.SIGNATURES) return 'none';
  if (tokens < THRESHOLDS.SKELETON) return 'signatures';
  return 'skeleton';
}

function runBenchmark(targetPath) {
  const basePath = targetPath || process.cwd();
  console.log(`\nToken Savings Benchmark`);
  console.log(`Scanning: ${basePath}\n`);

  const files = collectFiles(basePath);
  if (files.length === 0) {
    console.log('No JS/TS files found.');
    return;
  }

  const results = [];
  for (const file of files) {
    try {
      results.push(analyzeFile(file));
    } catch (err) {
      // Skip unparseable files
    }
  }

  // Group by optimization mode
  const none = results.filter(r => getMode(r.rawTokens) === 'none');
  const signatures = results.filter(r => getMode(r.rawTokens) === 'signatures');
  const skeleton = results.filter(r => getMode(r.rawTokens) === 'skeleton');

  console.log('Files by size:');
  console.log(`  Small (<${THRESHOLDS.SIGNATURES} tokens):    ${none.length} files - no parsing needed`);
  console.log(`  Medium (${THRESHOLDS.SIGNATURES}-${THRESHOLDS.SKELETON - 1} tokens):  ${signatures.length} files - signatures mode`);
  console.log(`  Large (${THRESHOLDS.SKELETON}+ tokens):     ${skeleton.length} files - skeleton mode\n`);

  // Calculate totals for optimized files
  const optimized = [...signatures, ...skeleton];
  if (optimized.length === 0) {
    console.log('No files large enough to benefit from parsing.');
    return;
  }

  let totalRaw = 0;
  let totalParsed = 0;

  console.log('File'.padEnd(40) + 'Raw'.padStart(8) + 'Parsed'.padStart(8) + 'Saved'.padStart(8) + 'Mode'.padStart(12));
  console.log('─'.repeat(76));

  optimized.sort((a, b) => b.rawTokens - a.rawTokens);

  for (const r of optimized.slice(0, 20)) {
    const mode = getMode(r.rawTokens);
    const parsed = mode === 'signatures' ? r.sigTokens : r.skelTokens;
    const saved = r.rawTokens - parsed;
    const pct = ((saved / r.rawTokens) * 100).toFixed(0);

    const relPath = relative(basePath, r.path);
    const display = relPath.length > 38 ? '...' + relPath.slice(-35) : relPath;

    console.log(
      display.padEnd(40) +
      r.rawTokens.toLocaleString().padStart(8) +
      parsed.toLocaleString().padStart(8) +
      `${pct}%`.padStart(8) +
      mode.padStart(12)
    );

    totalRaw += r.rawTokens;
    totalParsed += parsed;
  }

  if (optimized.length > 20) {
    // Add remaining files to totals
    for (const r of optimized.slice(20)) {
      const mode = getMode(r.rawTokens);
      totalRaw += r.rawTokens;
      totalParsed += mode === 'signatures' ? r.sigTokens : r.skelTokens;
    }
    console.log(`... and ${optimized.length - 20} more files`);
  }

  console.log('─'.repeat(76));

  const totalSaved = totalRaw - totalParsed;
  const totalPct = ((totalSaved / totalRaw) * 100).toFixed(1);

  console.log(
    'TOTAL'.padEnd(40) +
    totalRaw.toLocaleString().padStart(8) +
    totalParsed.toLocaleString().padStart(8) +
    `${totalPct}%`.padStart(8)
  );

  console.log(`\nSummary:`);
  console.log(`  Files optimized: ${optimized.length}`);
  console.log(`  Raw tokens:      ${totalRaw.toLocaleString()}`);
  console.log(`  Parsed tokens:   ${totalParsed.toLocaleString()}`);
  console.log(`  Tokens saved:    ${totalSaved.toLocaleString()} (${totalPct}%)\n`);
}

const targetPath = process.argv[2] || process.cwd();
runBenchmark(targetPath);
