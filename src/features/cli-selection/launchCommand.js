// The shell line that starts the agent. plugins: [{ dir, folder }] already installed.
export function buildLaunchCommand({ command, base, resumeId, systemPrompt, powershell, plugins = [] }) {
  // PowerShell also reads the curly quotes as quote characters; doubling any of them keeps the string whole.
  const quote = (v) => `'${powershell ? v.replace(/['‘’‚‛]/g, '$&$&') : v.replace(/'/g, "'\\''")}'`;
  // Windows PowerShell 5.1 cuts a native argument at an embedded " unless it is \"; pwsh 7
  // escapes it itself (a \" there would arrive literally). So pick at run time.
  const std = "$PSNativeCommandArgumentPassing -in 'Standard','Windows'";
  const promptArg = (v) => {
    if (!powershell || !v.includes('"')) return quote(v);
    // Backslashes before a " (or before the closing one 5.1 adds) must be doubled there.
    if (/\x5c+(?=["]|$)/.test(v)) {
      const legacy = v.replace(/(\x5c*)(")/g, '$1$1\x5c$2').replace(/\x5c+$/, '$&$&');
      return `$(if (${std}) { ${quote(v)} } else { ${quote(legacy)} })`;
    }
    return `(${quote(v)}.Replace('"', $(if (${std}) { '"' } else { '\\"' })))`;
  };
  if (base) command += ` --plugin-dir ${quote(base)}`;
  if (resumeId) command += ` --resume ${quote(resumeId)}`;
  if (systemPrompt) command += ` --append-system-prompt ${promptArg(systemPrompt)}`;
  for (const p of plugins) command += ` --plugin-dir ${quote(p.dir)} --add-dir ${quote(p.folder)}`;
  // Clear the screen first so the agent starts on a clean terminal.
  return `${powershell ? 'Clear-Host;' : 'clear &&'} ${command}\r`;
}
