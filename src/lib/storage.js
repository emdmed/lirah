// localStorage, read and written without throwing: private mode, a full quota
// or a corrupt value fall back instead of breaking the caller.

/** The JSON value stored at `key`, or `fallback` when it is missing or can't be read. */
export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to read ${key} from localStorage:`, error);
    return fallback;
  }
}

/** Store `value` as JSON at `key`. False when it couldn't be written. */
export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Failed to write ${key} to localStorage:`, error);
    return false;
  }
}

/** The plain string stored at `key`, or `fallback`. */
export function loadText(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Store a plain string at `key`. False when it couldn't be written. */
export function saveText(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
