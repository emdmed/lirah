/**
 * Normalize paths for cross-platform compatibility.
 * Converts backslashes to forward slashes and removes trailing slashes.
 * @param {string} p - The path to normalize
 * @returns {string} The normalized path
 */
export const normalizePath = (p) => {
  if (!p) return p;
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
};
