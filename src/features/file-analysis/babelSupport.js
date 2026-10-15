// Extension check only — importing this must never pull Babel into the bundle.
const BABEL_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];

export const isBabelParseable = (path) => {
  return BABEL_EXTENSIONS.some(ext => path.endsWith(ext));
};
