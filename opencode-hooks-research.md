# OpenCode Hooks & Plugins Research

## Overview

OpenCode uses a **plugin system** for extensibility, not bash-based hooks like Claude Code. Plugins are JS/TS files that intercept events and tool executions.

## Configuration

- **Config file:** `opencode.json` (project root) or `~/.config/opencode/opencode.json` (global)
- **Config format:** JSON / JSONC (JSON with Comments)
- **Schema:** `https://opencode.ai/config.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": {
    "my-plugin": {
      "enabled": true
    }
  }
}
```

## Plugin File Structure

Plugins live in `.opencode/plugin/` as TypeScript or JavaScript files:

```
.opencode/
├── plugin/
│   ├── env-protection.ts
│   ├── auto-format.ts
│   └── slack-notifier.ts
└── command/
    └── test.md
```

## Hook Mechanics

Two main hook points:

| Hook | When | Use Case |
|------|------|----------|
| `before` | Before tool execution | Block operations, validate, inject context |
| `after` | After tool completion | Post-processing, notifications, logging |

Hooks are **event-driven** (internal), not HTTP webhooks. They can:
- Prevent sensitive file access
- Auto-format code
- Trigger notifications
- Intercept tool executions

## Claude Code Hooks (for comparison)

| Claude Code | OpenCode Equivalent |
|------------|-------------------|
| `~/.claude/hooks/classify.sh` (UserPromptSubmit) | `.opencode/plugin/classify.ts` (before hook) |
| `~/.claude/hooks/maintain.sh` (SessionStart) | `.opencode/plugin/maintain.ts` (before hook on session init?) |
| `~/.claude/hooks/guard-explore.sh` (PreToolUse) | `.opencode/plugin/guard-explore.ts` (before hook on tool use) |
| `~/.claude/settings.json` hooks config | `opencode.json` plugins config |
| Bash scripts | TypeScript/JavaScript files |
| Global (`~/.claude/hooks/`) | Per-project (`.opencode/plugin/`) or global (`~/.config/opencode/plugins/`) |

## Key Differences

1. **Language:** Claude Code hooks are bash scripts; opencode plugins are JS/TS
2. **Scope:** Claude Code hooks are global (per-user); opencode plugins can be per-project or global
3. **Events:** Claude Code has specific named events (`UserPromptSubmit`, `SessionStart`, `PreToolUse`); opencode has generic `before`/`after` on tool executions
4. **Configuration:** Claude Code uses `settings.json` with hook registration; opencode uses `opencode.json` with plugin registration
5. **stdin/stdout protocol:** Claude Code hooks receive JSON on stdin and output text/JSON on stdout; opencode plugins use a JS/TS API

## Open Questions

- Does opencode have a session-start equivalent event? (for maintain/sync)
- Can opencode plugins inject system prompts like Claude Code's UserPromptSubmit hooks?
- What's the exact TypeScript API for opencode plugins (before/after signatures)?
- Can opencode plugins return "deny" decisions like Claude Code's PreToolUse hooks?

## Sources

- https://opencode.ai/docs/config/
- https://opencode.ai/docs/cli/
- https://dev.to/einarcesar/does-opencode-support-hooks-a-complete-guide-to-extensibility-k3p
