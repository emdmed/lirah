// A killed CLI never gets to switch off the modes its TUI turned on, so the
// terminal keeps them: mouse moves would print as text into the shell. These
// are written to the xterm display (not the PTY) right after a kill.
export const TERMINAL_MODE_RESET =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l' + // mouse tracking and encodings
  '\x1b[?2004l' + // bracketed paste
  '\x1b[?1004l' + // focus reporting
  '\x1b[?1049l' + // alternate screen
  '\x1b[<u' + // pop the kitty keyboard mode
  '\x1b[?25h'; // show the cursor

// Kill the CLI; if something died, wait delayMs and reset the display modes
// before returning, so what the caller types next lands in a clean terminal.
export async function killCliAndResetTerminal({ kill, write, delayMs = 300 }) {
  const killed = await kill();
  if (!killed) return false;
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  await write(TERMINAL_MODE_RESET);
  return true;
}
