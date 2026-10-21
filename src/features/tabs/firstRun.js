// Set by App when it starts with no saved tabs and no CLI path, so the first
// tab can offer the project picker (InitialProjectDialog) once its terminal is
// up. Consumed once: later tabs never see it.
let pending = false;

export function markFirstRun() {
  pending = true;
}

export function consumeFirstRun() {
  const was = pending;
  pending = false;
  return was;
}
