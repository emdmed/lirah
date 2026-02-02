# Example improved structure

import { readFile, readdir, stat } from 'fs/promises';
import { performance } from 'perf_hooks';

// Constants configuration
const CONFIG = {
  SKIP_DIRS: ['node_modules', 'dist', '.git', 'target', 'build', '.next', '.turbo', 'out', 'coverage', '.cache', '__pycache__'],
  FILE_SIZE_LIMIT: 1024 * 1024, // 1MB
  SMALL_FILE_LIMIT: 300,
  MEDIUM_FILE_LIMIT: 800,
  MAX_DISPLAY_FILES: 15,
  AVG_SELECTED_FILES: 5,
  FALSE_POSITIVE_READ_RATE: 0.3,
  AVG_SMALL_FILE_SIZE: 3000,
  PATH_PREFIX_CHARS: 20
};

// File content cache to avoid repeated reads
const fileContentCache = new Map();

// Async directory traversal with parallel processing
async function traverseDirectoryAsync(dir, fileCallback, options = {}) {
  const { skipDirs = CONFIG.SKIP_DIRS, includeHidden = false, maxConcurrency = 50 } = options;
  const results = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const subdirs = [];
    const files = [];
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name) && (includeHidden || !entry.name.startsWith('.'))) {
          subdirs.push(fullPath);
        }
      } else if (entry.isFile()) {
        files.push({ entry, fullPath });
      }
    }
    
    // Process files in parallel batches
    for (let i = 0; i < files.length; i += maxConcurrency) {
      const batch = files.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map(({ entry, fullPath }) => fileCallback(entry, fullPath))
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(files[index].fullPath);
        }
      });
    }
    
    // Process subdirectories recursively in parallel
    if (subdirs.length > 0) {
      const subdirResults = await Promise.allSettled(
        subdirs.map(subdir => traverseDirectoryAsync(subdir, fileCallback, options))
      );
      
      subdirResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        }
      });
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
  }
  
  return results;
}

// Cached file reading
async function readFileCached(filePath) {
  if (fileContentCache.has(filePath)) {
    return fileContentCache.get(filePath);
  }
  
  try {
    const content = await readFile(filePath, 'utf-8');
    fileContentCache.set(filePath, content);
    return content;
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

// Improved grep simulation with caching
async function simulateGrepFilesOutputCached(files, basePath, searchPattern) {
  const results = [];
  const regex = new RegExp(searchPattern, 'gi');
  
  for (const file of files) {
    try {
      const content = await readFileCached(file);
      if (regex.test(content)) {
        results.push(relative(basePath, file));
      }
      regex.lastIndex = 0;
    } catch {
      // Skip unreadable files
    }
  }
  
  return results.join('\n');
}

// Error categorization
class BenchmarkError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'BenchmarkError';
    this.code = code;
    this.details = details;
  }
}

const ERROR_CODES = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  PARSE_ERROR: 'PARSE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_PATH: 'INVALID_PATH'
};

// Robust error handling with retries
async function safeFileOperation(filePath, operation, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation(filePath);
    } catch (error) {
      lastError = error;
      
      if (error.code === 'ENOENT') {
        throw new BenchmarkError(`File not found: ${filePath}`, ERROR_CODES.FILE_NOT_FOUND);
      }
      
      if (error.code === 'EACCES') {
        throw new BenchmarkError(`Permission denied: ${filePath}`, ERROR_CODES.PERMISSION_DENIED);
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff for transient errors
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new BenchmarkError(
    `Failed after ${maxRetries} attempts: ${lastError.message}`,
    ERROR_CODES.PARSE_ERROR,
    { originalError: lastError }
  );
}

// Security utilities
class SecurityValidator {
  static sanitizePath(path) {
    if (!path || typeof path !== 'string') {
      throw new BenchmarkError('Path must be a non-empty string', ERROR_CODES.INVALID_PATH);
    }
    
    // Normalize path and resolve any relative components
    const normalized = path.replace(/[\/\\]+/g, '/');
    
    // Check for path traversal attempts
    if (normalized.includes('..') || normalized.includes('~')) {
      throw new BenchmarkError('Path traversal not allowed', ERROR_CODES.INVALID_PATH);
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\0/,           // Null bytes
      /[\r\n]/,       // Line breaks
      /[<>]/,         // HTML/JS injection
      /[|&;$`]/       // Command injection
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(normalized))) {
      throw new BenchmarkError('Invalid characters in path', ERROR_CODES.INVALID_PATH);
    }
    
    return normalized;
  }
  
  static validateFileSize(size, limit = CONFIG.FILE_SIZE_LIMIT) {
    if (size > limit) {
      throw new BenchmarkError(
        `File size ${size} exceeds limit ${limit}`,
        ERROR_CODES.FILE_TOO_LARGE,
        { size, limit }
      );
    }
  }
  
  static validateRegex(pattern) {
    try {
      new RegExp(pattern);
    } catch (error) {
      throw new BenchmarkError(
        `Invalid regex pattern: ${error.message}`,
        ERROR_CODES.INVALID_PATH,
        { pattern }
      );
    }
  }
}

// Resource monitoring
class ResourceMonitor {
  constructor(options = {}) {
    this.maxFiles = options.maxFiles || 10000;
    this.maxTotalSize = options.maxTotalSize || 100 * 1024 * 1024; // 100MB
    this.maxConcurrentOps = options.maxConcurrentOps || 50;
    this.currentOps = 0;
    this.totalFilesProcessed = 0;
    this.totalSizeProcessed = 0;
  }
  
  async acquire() {
    if (this.currentOps >= this.maxConcurrentOps) {
      throw new BenchmarkError('Too many concurrent operations', ERROR_CODES.PERMISSION_DENIED);
    }
    
    if (this.totalFilesProcessed >= this.maxFiles) {
      throw new BenchmarkError('File limit exceeded', ERROR_CODES.FILE_TOO_LARGE);
    }
    
    this.currentOps++;
  }
  
  release() {
    this.currentOps = Math.max(0, this.currentOps - 1);
  }
  
  trackFile(size) {
    SecurityValidator.validateFileSize(size, this.maxTotalSize - this.totalSizeProcessed);
    this.totalFilesProcessed++;
    this.totalSizeProcessed += size;
  }
  
  getStats() {
    return {
      filesProcessed: this.totalFilesProcessed,
      sizeProcessed: this.totalSizeProcessed,
      concurrentOps: this.currentOps,
      remainingFiles: this.maxFiles - this.totalFilesProcessed,
      remainingSize: this.maxTotalSize - this.totalSizeProcessed
    };
  }
}

// Secure input validation
function validateInput(path) {
  return SecurityValidator.sanitizePath(path);
}

// Safe regex creation for grep patterns
function createSafeRegex(pattern) {
  SecurityValidator.validateRegex(pattern);
  return new RegExp(pattern, 'gi');
}

// Improved analyzeFile with robust error handling
async function analyzeFileSafe(filePath) {
  validateInput(filePath);
  
  return safeFileOperation(filePath, async (path) => {
    const content = await readFileCached(path);
    const lines = content.split('\n').length;
    const rawChars = charCount(content);
    
    // Validate content size
    if (rawChars > CONFIG.FILE_SIZE_LIMIT) {
      throw new BenchmarkError(
        `File too large: ${path} (${rawChars} bytes)`,
        ERROR_CODES.FILE_TOO_LARGE,
        { size: rawChars, limit: CONFIG.FILE_SIZE_LIMIT }
      );
    }
    
    try {
      const signatures = extractSignatures(content, path);
      const skeleton = extractSkeleton(content, path);
      
      const signaturesText = formatSignaturesForPrompt(signatures);
      const skeletonText = formatSkeletonForPrompt(skeleton);
      
      const componentCount = skeleton?.components?.length || 0;
      const functionCount = skeleton?.functions?.length || 0;
      const contextCount = skeleton?.contexts?.length || 0;
      const totalSymbols = componentCount + functionCount + contextCount;
      
      return {
        path,
        lines,
        rawChars,
        signatures: { count: signatures.length, text: signaturesText, chars: charCount(signaturesText) },
        skeleton: { text: skeletonText, chars: charCount(skeletonText), components: componentCount, functions: functionCount },
        totalSymbols,
        success: true
      };
    } catch (parseError) {
      throw new BenchmarkError(
        `Parse error in ${path}: ${parseError.message}`,
        ERROR_CODES.PARSE_ERROR,
        { parseError }
      );
    }
  });
}

// Error reporting utility
function reportErrors(errors, maxDisplay = 10) {
  if (errors.length === 0) return;
  
  console.log(`\n⚠️  Encountered ${errors.length} errors (showing first ${Math.min(maxDisplay, errors.length)}):`);
  
  const errorCounts = {};
  errors.forEach(error => {
    errorCounts[error.code] = (errorCounts[error.code] || 0) + 1;
  });
  
  Object.entries(errorCounts).forEach(([code, count]) => {
    console.log(`   ${code}: ${count} occurrences`);
  });
  
  errors.slice(0, maxDisplay).forEach(error => {
    console.log(`   ${error.message}`);
  });
  
  if (errors.length > maxDisplay) {
    console.log(`   ... and ${errors.length - maxDisplay} more errors`);
  }
}

// Configuration class for flexible benchmarking
class BenchmarkConfig {
  constructor(options = {}) {
    this.skipDirs = options.skipDirs || CONFIG.SKIP_DIRS;
    this.fileSizeLimit = options.fileSizeLimit || CONFIG.FILE_SIZE_LIMIT;
    this.smallFileLimit = options.smallFileLimit || CONFIG.SMALL_FILE_LIMIT;
    this.mediumFileLimit = options.mediumFileLimit || CONFIG.MEDIUM_FILE_LIMIT;
    this.maxDisplayFiles = options.maxDisplayFiles || CONFIG.MAX_DISPLAY_FILES;
    this.outputFormat = options.outputFormat || 'console'; // 'console', 'json', 'csv'
    this.includeExploration = options.includeExploration !== false;
    this.taskTypes = options.taskTypes || ['feature', 'bugfix', 'refactor'];
    this.maxConcurrency = options.maxConcurrency || 50;
    this.enablePerformanceMetrics = options.enablePerformanceMetrics || false;
  }
}

// Result data structure
class BenchmarkResult {
  constructor() {
    this.summary = {
      totalFiles: 0,
      parseableFiles: 0,
      optimizedFiles: 0,
      totalSymbols: 0,
      rawChars: 0,
      optimizedChars: 0,
      savedChars: 0,
      savingsPercentage: 0,
      errors: []
    };
    
    this.fileAnalysis = [];
    this.explorationResults = [];
    this.performanceMetrics = {};
  }
  
  addFileAnalysis(analysis) {
    this.fileAnalysis.push(analysis);
  }
  
  addError(error) {
    this.summary.errors.push(error);
  }
  
  calculateSummary() {
    const optimizedFiles = this.fileAnalysis.filter(f => 
      f.lines >= this.smallFileLimit
    );
    
    this.summary.totalFiles = this.fileAnalysis.length;
    this.summary.optimizedFiles = optimizedFiles.length;
    this.summary.totalSymbols = optimizedFiles.reduce((sum, f) => sum + f.signatures.count, 0);
    this.summary.rawChars = optimizedFiles.reduce((sum, f) => sum + f.rawChars, 0);
    
    this.summary.optimizedChars = optimizedFiles.reduce((sum, f) => {
      const mode = getAutoMode(f.lines, this.smallFileLimit, this.mediumFileLimit);
      return sum + (mode === 'signatures' ? f.signatures.chars : f.skeleton.chars);
    }, 0);
    
    this.summary.savedChars = this.summary.rawChars - this.summary.optimizedChars;
    this.summary.savingsPercentage = this.summary.rawChars > 0 
      ? ((this.summary.savedChars / this.summary.rawChars) * 100).toFixed(1)
      : 0;
  }
}

// Main benchmark class
class TokenBenchmark {
  constructor(config = new BenchmarkConfig()) {
    this.config = config;
    this.results = new BenchmarkResult();
  }
  
  async run(targetPath) {
    validateInput(targetPath);
    
    if (this.config.enablePerformanceMetrics) {
      return await measurePerformanceAsync('Total benchmark', () => this._runInternal(targetPath));
    } else {
      return await this._runInternal(targetPath);
    }
  }
  
  async _runInternal(targetPath) {
    // Collect files
    const [allFiles, parseableFiles] = await Promise.all([
      traverseDirectoryAsync(targetPath, this._createFileFilter(), {
        skipDirs: this.config.skipDirs,
        maxConcurrency: this.config.maxConcurrency
      }),
      traverseDirectoryAsync(targetPath, (entry, path) => isBabelParseable(path), {
        skipDirs: this.config.skipDirs,
        maxConcurrency: this.config.maxConcurrency
      })
    ]);
    
    this.results.summary.totalFiles = allFiles.length;
    this.results.summary.parseableFiles = parseableFiles.length;
    
    // Analyze files
    await this._analyzeFiles(parseableFiles);
    
    // Calculate summary
    this.results.calculateSummary();
    
    // Run exploration benchmark if enabled
    if (this.config.includeExploration) {
      this.results.explorationResults = await this._runExplorationBenchmark(targetPath, allFiles, parseableFiles);
    }
    
    return this.results;
  }
  
  _createFileFilter() {
    return async (entry, fullPath) => {
      try {
        const stats = await stat(fullPath);
        return stats.size < this.config.fileSizeLimit;
      } catch {
        return false;
      }
    };
  }
  
  async _analyzeFiles(files) {
    const batchSize = Math.min(this.config.maxConcurrency, files.length);
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(file => analyzeFileSafe(file))
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          this.results.addFileAnalysis(result.value);
        } else {
          this.results.addError(result.reason || result.value);
        }
      });
    }
  }
  
  async _runExplorationBenchmark(basePath, allFiles, parseableFiles) {
    const explorationResults = [];
    
    for (const taskType of this.config.taskTypes) {
      const patterns = getExplorationPatterns(taskType);
      let totalExplorationChars = 0;
      const patternResults = [];
      
      for (const pattern of patterns) {
        let output;
        if (pattern.type === 'glob') {
          output = simulateGlobOutput(allFiles, basePath, pattern.pattern);
        } else {
          output = await simulateGrepFilesOutputCached(parseableFiles, basePath, pattern.pattern);
        }
        
        const chars = charCount(output);
        totalExplorationChars += chars;
        patternResults.push({ ...pattern, chars, lineCount: output.split('\n').filter(Boolean).length });
      }
      
      explorationResults.push({
        taskType,
        patterns: patternResults,
        totalChars: totalExplorationChars,
      });
    }
    
    return explorationResults;
  }
  
  // Output formatters
  formatConsole() {
    // Implementation for console output (similar to original)
    return this._formatConsoleOutput();
  }
  
  formatJson() {
    return JSON.stringify(this.results, null, 2);
  }
  
  formatCsv() {
    // CSV implementation for data analysis
    const headers = ['path', 'lines', 'rawChars', 'signaturesCount', 'signaturesChars', 'skeletonChars', 'totalSymbols'];
    const rows = this.results.fileAnalysis.map(file => [
      file.path,
      file.lines,
      file.rawChars,
      file.signatures.count,
      file.signatures.chars,
      file.skeleton.chars,
      file.totalSymbols
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}