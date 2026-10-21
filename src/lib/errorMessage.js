/** A caught error as text: its message, or the thrown value itself. */
export function errorMessage(e) {
  return String(e?.message || e);
}
