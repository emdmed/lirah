import { extractAll, extractSkeleton } from './babelSymbolParser';

// Babel parses off the main thread: a large file takes long enough to drop
// frames, and compacting a project parses hundreds of them.
self.onmessage = ({ data: { id, op, code, filePath } }) => {
  try {
    const result = op === 'skeleton' ? extractSkeleton(code, filePath) : extractAll(code, filePath);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
