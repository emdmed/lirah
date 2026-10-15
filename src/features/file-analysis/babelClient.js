// Promise API over babelWorker. Babel (~800 KB) lives only in the worker
// chunk; if a worker can't be created it is loaded on the main thread instead.
let worker = null;
let workerFailed = false;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./babelWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: { id, result, error } }) => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(result);
    };
    worker.onerror = (event) => {
      console.error('Babel worker failed, falling back to main thread:', event.message);
      worker.terminate();
      worker = null;
      workerFailed = true;
      // Re-run whatever was in flight on the main thread.
      const inFlight = [...pending.values()];
      pending.clear();
      for (const entry of inFlight) runOnMainThread(entry.request).then(entry.resolve, entry.reject);
    };
  } catch (error) {
    console.error('Babel worker unavailable, parsing on main thread:', error);
    workerFailed = true;
  }
  return worker;
}

async function runOnMainThread({ op, code, filePath }) {
  const parser = await import('./babelSymbolParser');
  return op === 'skeleton' ? parser.extractSkeleton(code, filePath) : parser.extractAll(code, filePath);
}

function run(request) {
  const w = getWorker();
  if (!w) return runOnMainThread(request);
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, request });
    w.postMessage({ id, ...request });
  });
}

// { symbols, signatures, skeleton } from a single parse.
export const analyzeFile = (code, filePath) => run({ op: 'all', code, filePath });

export const analyzeSkeleton = (code, filePath) => run({ op: 'skeleton', code, filePath });
