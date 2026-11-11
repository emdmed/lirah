// The shell line that starts the agent. plugins: [{ dir, folder }] already installed.
export function buildLaunchCommand({ command, base, resumeId, systemPrompt, powershell, plugins = [] }) {
  // PowerShell also reads the curly quotes as quote characters; doubling any of them keeps the string whole.
  const quote = (v) => `'${powershell ? v.replace(/['‘’‚‛]/g, '$&$&') : v.replace(/'/g, "'\\''")}'`;
  if (base) command += ` --plugin-dir ${quote(base)}`;
  if (resumeId) command += ` --resume ${quote(resumeId)}`;
  if (systemPrompt) command += ` --append-system-prompt ${quote(systemPrompt)}`;
  for (const p of plugins) command += ` --plugin-dir ${quote(p.dir)} --add-dir ${quote(p.folder)}`;
  // Clear the screen first so the agent starts on a clean terminal.
  return `${powershell ? 'Clear-Host;' : 'clear &&'} ${command}\r`;
}
