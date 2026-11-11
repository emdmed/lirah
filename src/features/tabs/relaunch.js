import { TERMINAL_MODE_RESET, killCliAndResetTerminal } from './terminalReset';

// Stop the CLI of a tab and leave its shell clean before typing into it.
// xterm keeps reporting the mouse to the PTY while the dying CLI is gone, so
// the shell would read "[<35;80;4M" as part of the next line: switch the modes
// off on the display first (not after the wait), then let the kill reset again,
// then Ctrl+C the shell to drop whatever it already collected. Ctrl+C is sent
// even when nothing was killed: on an empty prompt it is harmless.
export async function relaunchCli({ kill, writeDisplay, writePty, launch = async () => {}, delayMs = 300 }) {
  await writeDisplay(TERMINAL_MODE_RESET);
  await killCliAndResetTerminal({ kill, write: writeDisplay, delayMs });
  await writePty('\x03');
  return launch();
}
