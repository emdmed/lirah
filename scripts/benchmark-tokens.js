#!/usr/bin/env node
/**
 * Token Savings Benchmark
 *
 * Measures how much the Smart Token Optimization feature reduces context size
 * by comparing raw file content vs optimized output (signatures/skeleton).
 *
 * Usage: node scripts/benchmark-tokens.js [path]
 */

import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import {
  isBabelParseable,
  extractSignatures,
  extractSkeleton,
  formatSignaturesForPrompt,
  formatSkeletonForPrompt,
} from '../src/utils/babelSymbolParser.js';

const charCount = (text) => (text || '').length;

// Collect all parseable files recursively
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
      if (!['node_modules', 'dist', '.git', 'target', 'build', '.next', '.turbo', 'out', 'coverage'].includes(entry.name)) {
        collectFiles(fullPath, files);
      }
    } else if (entry.isFile() && isBabelParseable(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

// Analyze a single file
function analyzeFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').length;
  const rawChars = charCount(content);

  const signatures = extractSignatures(content, filePath);
  const skeleton = extractSkeleton(content, filePath);

  const signaturesText = formatSignaturesForPrompt(signatures);
  const skeletonText = formatSkeletonForPrompt(skeleton);

  // Count actual symbols for coverage metric
  const componentCount = skeleton?.components?.length || 0;
  const functionCount = skeleton?.functions?.length || 0;
  const contextCount = skeleton?.contexts?.length || 0;
  const totalSymbols = componentCount + functionCount + contextCount;

  return {
    path: filePath,
    lines,
    rawChars,
    signatures: { count: signatures.length, text: signaturesText, chars: charCount(signaturesText) },
    skeleton: { text: skeletonText, chars: charCount(skeletonText), components: componentCount, functions: functionCount },
    totalSymbols,
  };
}

function getAutoMode(lines) {
  if (lines < 300) return 'path-only';
  if (lines < 800) return 'signatures';
  return 'skeleton';
}

// Main benchmark
function runBenchmark(targetPath) {
  const basePath = targetPath || process.cwd();
  console.log(`\n📊 Token Savings Benchmark`);
  console.log(`   Scanning: ${basePath}\n`);

  const files = collectFiles(basePath);
  console.log(`   Found ${files.length} parseable JS/TS files\n`);

  if (files.length === 0) {
    console.log('   No JS/TS files found.');
    return;
  }

  const small = [], medium = [], large = [];

  for (const file of files) {
    try {
      const analysis = analyzeFile(file);
      if (analysis.lines < 300) {
        small.push(analysis);
      } else if (analysis.lines < 800) {
        medium.push(analysis);
      } else {
        large.push(analysis);
      }
    } catch (err) {
      console.warn(`   Warning: Failed to analyze ${file}: ${err.message}`);
    }
  }

  console.log('─'.repeat(70));
  console.log('FILE SIZE DISTRIBUTION');
  console.log('─'.repeat(70));
  console.log(`Small (<300 lines):    ${small.length} files   → No optimization (agent reads full)`);
  console.log(`Medium (300-799):      ${medium.length} files   → Signatures mode`);
  console.log(`Large (800+):          ${large.length} files   → Skeleton mode`);
  console.log('─'.repeat(70));

  const optimizedFiles = [...medium, ...large];

  if (optimizedFiles.length === 0) {
    console.log('\nNo files large enough for optimization (all <300 lines).');
    console.log('Token optimization activates at 300+ lines.\n');
    return;
  }

  console.log('\nOPTIMIZED FILES (300+ lines)\n');
  console.log('File'.padEnd(35) + 'Lines'.padStart(6) + 'Mode'.padStart(11) + 'Raw'.padStart(9) + 'Opt'.padStart(7) + 'Saved'.padStart(9) + '%'.padStart(6) + 'Syms'.padStart(6));
  console.log('─'.repeat(89));

  optimizedFiles.sort((a, b) => b.rawChars - a.rawChars);

  for (const f of optimizedFiles.slice(0, 15)) {
    const relPath = relative(basePath, f.path);
    const displayPath = relPath.length > 33 ? '...' + relPath.slice(-30) : relPath;
    const mode = getAutoMode(f.lines);
    const modeLabel = mode === 'signatures' ? 'Signatures' : 'Skeleton';
    const optChars = mode === 'signatures' ? f.signatures.chars : f.skeleton.chars;
    const saved = f.rawChars - optChars;
    const pct = ((saved / f.rawChars) * 100).toFixed(0);

    console.log(
      displayPath.padEnd(35) +
      f.lines.toString().padStart(6) +
      modeLabel.padStart(11) +
      f.rawChars.toString().padStart(9) +
      optChars.toString().padStart(7) +
      saved.toString().padStart(9) +
      (pct + '%').padStart(6) +
      f.signatures.count.toString().padStart(6)
    );
  }

  if (optimizedFiles.length > 15) {
    console.log(`\n   ... and ${optimizedFiles.length - 15} more files`);
  }

  // Calculate totals ONLY for optimized files
  const totalRaw = optimizedFiles.reduce((sum, f) => sum + f.rawChars, 0);
  const totalOpt = optimizedFiles.reduce((sum, f) => {
    const mode = getAutoMode(f.lines);
    return sum + (mode === 'signatures' ? f.signatures.chars : f.skeleton.chars);
  }, 0);
  const totalSaved = totalRaw - totalOpt;
  const savingsPct = ((totalSaved / totalRaw) * 100).toFixed(1);
  const totalSymbols = optimizedFiles.reduce((sum, f) => sum + f.signatures.count, 0);

  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY (optimized files only)');
  console.log('═'.repeat(70));
  console.log(`Files optimized:              ${optimizedFiles.length} of ${files.length} total`);
  console.log(`Total symbols extracted:      ${totalSymbols}`);
  console.log(`Full content (chars):         ${totalRaw.toLocaleString()}`);
  console.log(`Optimized (chars):            ${totalOpt.toLocaleString()}`);
  console.log(`Chars saved:                  ${totalSaved.toLocaleString()} (${savingsPct}%)`);
  console.log('═'.repeat(70));

  // Breakdown by mode
  if (medium.length > 0) {
    const mediumRaw = medium.reduce((sum, f) => sum + f.rawChars, 0);
    const mediumOpt = medium.reduce((sum, f) => sum + f.signatures.chars, 0);
    const mediumPct = (((mediumRaw - mediumOpt) / mediumRaw) * 100).toFixed(1);
    const mediumSyms = medium.reduce((sum, f) => sum + f.signatures.count, 0);
    console.log(`\nSignatures mode (${medium.length} files):`);
    console.log(`  ${mediumRaw.toLocaleString()} → ${mediumOpt.toLocaleString()} chars (${mediumPct}% reduction)`);
    console.log(`  ${mediumSyms} symbols extracted`);
  }

  if (large.length > 0) {
    const largeRaw = large.reduce((sum, f) => sum + f.rawChars, 0);
    const largeOpt = large.reduce((sum, f) => sum + f.skeleton.chars, 0);
    const largePct = (((largeRaw - largeOpt) / largeRaw) * 100).toFixed(1);
    const largeComponents = large.reduce((sum, f) => sum + f.skeleton.components, 0);
    const largeFunctions = large.reduce((sum, f) => sum + f.skeleton.functions, 0);
    console.log(`\nSkeleton mode (${large.length} files):`);
    console.log(`  ${largeRaw.toLocaleString()} → ${largeOpt.toLocaleString()} chars (${largePct}% reduction)`);
    console.log(`  ${largeComponents} components, ${largeFunctions} functions`);
  }

  console.log('\n💡 Note: Savings = initial prompt reduction. Agent may still request line ranges.');
  console.log('   Small files (<300 lines) are read fully by the agent.\n');
}

const targetPath = process.argv[2] || process.cwd();
runBenchmark(targetPath);
