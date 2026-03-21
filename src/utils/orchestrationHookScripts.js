// Hook script contents for orchestration hook installer.
// These are the same scripts installed in ~/.claude/hooks/ by the orchestration system.

export const CLASSIFY_SCRIPT = `#!/bin/bash
# Orchestration Hook: UserPromptSubmit (v2.0.0)
# Session-aware injection: full protocol on first prompt, condensed reminder on subsequent.
# Auto-classifies workflow, detects EXEMPT tasks, injects patterns.

set -uo pipefail

PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

# --- Per-prompt: clear markers so each prompt starts fresh ---
rm -f "$PROJECT_DIR/.orchestration/tools/.exempt"
rm -f "$PROJECT_DIR/.orchestration/tools/.compaction_grepped"

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .user_input // ""' 2>/dev/null) || PROMPT=""
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

CDN_BASE="https://agentic-orchestration-workflows.vercel.app"
CDN="$CDN_BASE/orchestration/workflows"
LOCAL="$PROJECT_DIR/.orchestration/workflows"
ORCH_FILE="$PROJECT_DIR/.orchestration/orchestration.md"
PROTOCOL_MARKER="$PROJECT_DIR/.orchestration/tools/.protocol_injected"

# --- Session-aware protocol loading ---
PROTOCOL_CONTENT=""
IS_FIRST_PROMPT=true

if [ -f "$PROTOCOL_MARKER" ]; then
  IS_FIRST_PROMPT=false
fi

if [ "$IS_FIRST_PROMPT" = true ]; then
  # First prompt: load full protocol
  if [ -f "$ORCH_FILE" ]; then
    PROTOCOL_CONTENT=$(cat "$ORCH_FILE")
  else
    PROTOCOL_CONTENT=$(curl -sL --max-time 5 "$CDN_BASE/orchestration/orchestration.md" 2>/dev/null) || PROTOCOL_CONTENT=""
  fi
  # Set marker for subsequent prompts
  mkdir -p "$PROJECT_DIR/.orchestration/tools"
  touch "$PROTOCOL_MARKER"
fi

# --- Detect project technology for workflow routing ---
# React (.jsx/.tsx) → workflows/react/ | .NET (.cs) → workflows/ | Other → workflows/
TECH_PREFIX=""
if find "$PROJECT_DIR" -maxdepth 4 -name '*.tsx' -o -name '*.jsx' 2>/dev/null | head -1 | grep -q .; then
  TECH_PREFIX="react/"
fi

# --- Classification Table ---
RULES=(
  "feature|\${TECH_PREFIX}feature.md|build create add implement new"
  "bugfix|\${TECH_PREFIX}bugfix.md|fix broken error crash bug"
  "refactor|\${TECH_PREFIX}refactor.md|clean improve restructure rename refactor"
  "performance|\${TECH_PREFIX}performance.md|slow optimize performance speed"
  "review|\${TECH_PREFIX}review.md|review check merge"
  "pr|\${TECH_PREFIX}pr.md|pr pull request"
  "test|\${TECH_PREFIX}test.md|test spec coverage e2e unit"
  "docs|\${TECH_PREFIX}docs.md|document readme explain"
  "todo|todo.md|complex multi-step plan"
  "patterns-gen|patterns-gen.md|patterns conventions generate"
)

# --- Match signal words ---
MATCHED_KEY=""
MATCHED_PATH=""
BEST_SCORE=0

for rule in "\${RULES[@]}"; do
  IFS='|' read -r key path words <<< "$rule"
  score=0
  for word in $words; do
    if echo "$PROMPT_LOWER" | grep -qiw "$word"; then
      score=$((score + 1))
    fi
  done
  if [ "$score" -gt "$BEST_SCORE" ]; then
    BEST_SCORE=$score
    MATCHED_KEY=$key
    MATCHED_PATH=$path
  fi
done

# --- Load matched workflow (if any) ---
WORKFLOW_CONTENT=""
CLASSIFICATION_NOTE=""

if [ "$BEST_SCORE" -gt 0 ]; then
  LOCAL_FILE="$LOCAL/$MATCHED_PATH"
  if [ -f "$LOCAL_FILE" ]; then
    WORKFLOW_CONTENT=$(cat "$LOCAL_FILE")
  else
    WORKFLOW_CONTENT=$(curl -sL --max-time 3 --retry 1 "$CDN/$MATCHED_PATH" 2>/dev/null) || WORKFLOW_CONTENT=""
  fi

  if [ -n "$WORKFLOW_CONTENT" ]; then
    CLASSIFICATION_NOTE="AUTO-CLASSIFIED: $MATCHED_KEY workflow (confidence: $BEST_SCORE signal words matched)"
  else
    CLASSIFICATION_NOTE="Auto-classified as '$MATCHED_KEY' but workflow file not found. Fetch from: $CDN/$MATCHED_PATH"
  fi
else
  CLASSIFICATION_NOTE="No auto-classification matched. Use the classification table in the protocol to classify this task manually."
fi

# --- EXEMPT detection (safe default: NOT exempt) ---
EXEMPT="false"

# Step 1: NEVER-EXEMPT keywords (architecture impact / multi-file / codebase search)
NEVER_EXEMPT_PATTERN="\\b(rename|refactor|restructure|move|delete|remove|replace|shared|component|import|export|across|everywhere|every|all files|multiple files|codebase|blast radius|dep graph|dependency|schema|migration|database|api|endpoint|route|middleware|auth)\\b"
HAS_NEVER_EXEMPT=false
if echo "$PROMPT_LOWER" | grep -qEi "$NEVER_EXEMPT_PATTERN"; then
  HAS_NEVER_EXEMPT=true
fi

# Step 2: Split EXEMPT signals into read-only and trivial-edit categories
READONLY_PATTERN="\\b(what does|what is|how does|explain|describe|tell me|show me|look at|read|view|open|print|list)\\b"
TRIVIAL_EDIT_PATTERN="\\b(typo|string literal|bump version|update version|change text|fix text|wording|label|fix typo)\\b"
HAS_READONLY=false
HAS_TRIVIAL_EDIT=false
if echo "$PROMPT_LOWER" | grep -qEi "$READONLY_PATTERN"; then
  HAS_READONLY=true
fi
if echo "$PROMPT_LOWER" | grep -qEi "$TRIVIAL_EDIT_PATTERN"; then
  HAS_TRIVIAL_EDIT=true
fi

# Step 3: Decision
if [ "$HAS_NEVER_EXEMPT" = true ]; then
  EXEMPT="false"
elif [ "$HAS_TRIVIAL_EDIT" = true ]; then
  EXEMPT="true"
elif [ "$HAS_READONLY" = true ] && [ "$BEST_SCORE" -le 1 ]; then
  EXEMPT="true"
else
  EXEMPT="false"
fi

# Write marker if EXEMPT
if [ "$EXEMPT" = "true" ]; then
  mkdir -p "$PROJECT_DIR/.orchestration/tools"
  touch "$PROJECT_DIR/.orchestration/tools/.exempt"
fi

# --- Load patterns if not EXEMPT ---
PATTERNS_CONTENT=""
if [ "$EXEMPT" = "false" ]; then
  PATTERNS_FILE="$PROJECT_DIR/.patterns/patterns.md"
  if [ -f "$PATTERNS_FILE" ]; then
    PATTERNS_CONTENT=$(cat "$PATTERNS_FILE")
  fi
fi

# --- Output ---
echo "<orchestration-hook>"

if [ "$IS_FIRST_PROMPT" = true ]; then
  if [ -n "$PROTOCOL_CONTENT" ]; then
    echo "--- ORCHESTRATION PROTOCOL (implement strictly) ---"
    echo "$PROTOCOL_CONTENT"
    echo "--- END PROTOCOL ---"
    echo ""
  fi
else
  cat <<'REMINDER'
--- ORCHESTRATION REMINDER ---
GATED SEQUENCE: 1) Compact → 2) Grep compaction → 3) Read source (only for gaps)
HARD RULE: Do NOT Read source, Glob, or Explore until compaction is grepped and findings stated.
NO CONTEXT REUSE: Each new task must grep compaction independently.
BINDING: ⚙ [task] | [workflow + URL] | [simple/complex] | [tools]
EXEMPT: ⚙ [task] | EXEMPT — only when: single file, 1-2 ops, zero architecture impact, no codebase search.
COMPLETION: ✓ [task] | [workflow] | [files modified] | cleanup: [yes/no/n/a]
PATTERNS: If .patterns/patterns.md exists, load and treat as binding constraints.
--- END REMINDER ---

REMINDER
fi

echo "$CLASSIFICATION_NOTE"
echo "EXEMPT-DETECTED: $EXEMPT"

if [ -n "$WORKFLOW_CONTENT" ]; then
  echo ""
  echo "--- WORKFLOW: $MATCHED_KEY ---"
  echo "$WORKFLOW_CONTENT"
  echo "--- END WORKFLOW ---"
fi

if [ -n "$PATTERNS_CONTENT" ]; then
  echo ""
  echo "--- PATTERNS (binding constraints) ---"
  echo "$PATTERNS_CONTENT"
  echo "--- END PATTERNS ---"
fi

echo "</orchestration-hook>"

exit 0`;

export const MAINTAIN_SCRIPT = `#!/bin/bash
# Orchestration Hook: SessionStart
# Self-maintenance: checks CDN for protocol/script updates and downloads if needed.

set -uo pipefail

PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

ORCH_DIR="$PROJECT_DIR/.orchestration"
SCRIPTS_DIR="$ORCH_DIR/tools/scripts"
CDN_BASE="https://agentic-orchestration-workflows.vercel.app"

mkdir -p "$SCRIPTS_DIR"

# Clear session markers from previous sessions
rm -f "$ORCH_DIR/tools/.compaction_grepped"
rm -f "$ORCH_DIR/tools/.protocol_injected"

UPDATES=""

# --- 1. Check orchestration.md freshness ---
LOCAL_ORCH="$ORCH_DIR/orchestration.md"
if [ -f "$LOCAL_ORCH" ]; then
  CDN_ORCH=$(curl -sL --max-time 5 "$CDN_BASE/orchestration/orchestration.md" 2>/dev/null || echo "")
  if [ -n "$CDN_ORCH" ]; then
    LOCAL_HASH=$(sha256sum "$LOCAL_ORCH" | cut -d' ' -f1)
    CDN_HASH=$(echo "$CDN_ORCH" | sha256sum | cut -d' ' -f1)
    if [ "$LOCAL_HASH" != "$CDN_HASH" ]; then
      echo "$CDN_ORCH" > "$LOCAL_ORCH"
      UPDATES="\${UPDATES}Updated orchestration.md from CDN. "
    fi
  fi
fi

# --- 2. Check tool scripts via manifest.json ---
MANIFEST=$(curl -sL --max-time 5 "$CDN_BASE/tools/manifest.json" 2>/dev/null || echo "")
if [ -n "$MANIFEST" ] && echo "$MANIFEST" | jq empty 2>/dev/null; then
  for script in $(echo "$MANIFEST" | jq -r 'keys[]'); do
    EXPECTED_HASH=$(echo "$MANIFEST" | jq -r ".[\\"$script\\"] | if type == \\"object\\" then .sha256 else . end")
    LOCAL_SCRIPT="$SCRIPTS_DIR/$script"
    NEEDS_UPDATE=false

    if [ ! -f "$LOCAL_SCRIPT" ]; then
      NEEDS_UPDATE=true
    else
      ACTUAL_HASH=$(sha256sum "$LOCAL_SCRIPT" | cut -d' ' -f1)
      if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
        NEEDS_UPDATE=true
      fi
    fi

    if [ "$NEEDS_UPDATE" = true ]; then
      curl -sL --max-time 5 "$CDN_BASE/tools/$script" -o "$LOCAL_SCRIPT" 2>/dev/null && \\
        UPDATES="\${UPDATES}Updated script: $script. "
    fi
  done
else
  # No manifest — ensure base scripts exist
  for s in compaction.js dep-graph.js symbols.js; do
    if [ ! -f "$SCRIPTS_DIR/$s" ]; then
      curl -sL --max-time 5 "$CDN_BASE/tools/$s" -o "$SCRIPTS_DIR/$s" 2>/dev/null && \\
        UPDATES="\${UPDATES}Downloaded script: $s. "
    fi
  done
fi

# --- 2b. Check workflow freshness ---
WORKFLOW_DIR="$ORCH_DIR/workflows"
if [ -d "$WORKFLOW_DIR" ]; then
  for wf in $(find "$WORKFLOW_DIR" -name '*.md' -type f 2>/dev/null); do
    REL_PATH="\${wf#$WORKFLOW_DIR/}"
    CDN_WF=$(curl -sL --max-time 3 "$CDN_BASE/orchestration/workflows/$REL_PATH" 2>/dev/null || echo "")
    if [ -n "$CDN_WF" ]; then
      LOCAL_WF_HASH=$(sha256sum "$wf" | cut -d' ' -f1)
      CDN_WF_HASH=$(echo "$CDN_WF" | sha256sum | cut -d' ' -f1)
      if [ "$LOCAL_WF_HASH" != "$CDN_WF_HASH" ]; then
        echo "$CDN_WF" > "$wf"
        UPDATES="\${UPDATES}Updated workflow: $REL_PATH. "
      fi
    fi
  done
fi

# --- 3. Clean old artifacts (keep only latest of each) ---
for pattern in compacted depgraph symbols; do
  ls -t "$ORCH_DIR/tools/\${pattern}_"*.md 2>/dev/null | tail -n +2 | xargs rm -f 2>/dev/null || true
done

# --- 4. Check artifact staleness via git-sha ---
CURRENT_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
HAS_CHANGES=$(git -C "$PROJECT_DIR" status --short 2>/dev/null | head -1)
if [ -n "$CURRENT_SHA" ]; then
  for artifact in "$ORCH_DIR/tools/"compacted_*.md "$ORCH_DIR/tools/"depgraph_*.md "$ORCH_DIR/tools/"symbols_*.md; do
    [ -f "$artifact" ] || continue
    ARTIFACT_SHA=$(sed -n 's/.*git-sha:[[:space:]]*\\([0-9a-f]\\{7,\\}\\).*/\\1/p' "$artifact" 2>/dev/null | head -1) || ARTIFACT_SHA=""
    if [ -z "$ARTIFACT_SHA" ] || [ "$ARTIFACT_SHA" != "$CURRENT_SHA" ] || [ -n "$HAS_CHANGES" ]; then
      rm -f "$artifact"
      UPDATES="\${UPDATES}Removed stale artifact: $(basename "$artifact"). "
    fi
  done
fi

# --- Output ---
if [ -n "$UPDATES" ]; then
  echo "<orchestration-maintenance>\${UPDATES}</orchestration-maintenance>"
else
  echo "<orchestration-maintenance>All orchestration artifacts up to date.</orchestration-maintenance>"
fi

exit 0`;

export const GUARD_EXPLORE_SCRIPT = `#!/bin/bash
# Orchestration Hook: PreToolUse
# Guards against accessing source files before grepping compaction.
# Uses a session marker to track whether compaction was grepped.
# Blocks Read/Glob/Grep/Task(Explore) on source paths until compaction is grepped.

set -uo pipefail

PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

# Skip guard entirely for EXEMPT tasks
if [ -f "$PROJECT_DIR/.orchestration/tools/.exempt" ]; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""

MARKER="$PROJECT_DIR/.orchestration/tools/.compaction_grepped"

DENY_REASON="BLOCKED: You must grep compacted_*.md BEFORE accessing source files. Required sequence: 1) Generate compaction if missing (node .orchestration/tools/scripts/compaction.js <project-root>), 2) Grep .orchestration/tools/compacted_*.md for task-relevant terms, 3) State findings from compaction grep, 4) Only then access source files (state why compaction was insufficient). This tool call has been denied."

deny() {
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$DENY_REASON"
  }
}
JSON
  exit 0
}

# ─── Helper: check if a path is safe (orchestration infra, not source code) ───
is_safe_path() {
  local path="$1"
  if echo "$path" | grep -qE "(\\.orchestration/|\\.patterns/|CLAUDE\\.md$)"; then
    return 0
  fi
  if echo "$path" | grep -qE "\\.(json|yaml|yml|toml|md|txt|env|lock|config|gitignore|eslintrc|prettierrc)$"; then
    return 0
  fi
  return 1
}

# ─── Mark compaction as grepped when Grep targets compaction files ───
if [ "$TOOL_NAME" = "Grep" ]; then
  TARGET_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""' 2>/dev/null) || TARGET_PATH=""
  if echo "$TARGET_PATH" | grep -qE "compacted_|\\.orchestration/tools"; then
    if ls "$PROJECT_DIR/.orchestration/tools/compacted_"*.md >/dev/null 2>&1; then
      touch "$MARKER"
      exit 0
    else
      cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: No compaction artifact exists at .orchestration/tools/compacted_*.md. You must generate it FIRST before grepping. Run: node .orchestration/tools/scripts/compaction.js <project-root> — then grep the output."
  }
}
JSON
      exit 0
    fi
  fi
  if [ ! -f "$MARKER" ] && [ -n "$TARGET_PATH" ] && ! is_safe_path "$TARGET_PATH"; then
    deny
  fi
  exit 0
fi

# ─── Only guard Read, Glob, Task ───
case "$TOOL_NAME" in
  Read|Glob|Task) ;;
  *) exit 0 ;;
esac

# ─── Already grepped compaction? Allow everything ───
if [ -f "$MARKER" ]; then
  exit 0
fi

# ─── Check if targeting source files ───
IS_SOURCE=false

case "$TOOL_NAME" in
  Read)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || FILE_PATH=""
    if [ -n "$FILE_PATH" ] && ! is_safe_path "$FILE_PATH"; then
      IS_SOURCE=true
    fi
    ;;
  Glob)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""' 2>/dev/null) || PATTERN=""
    SEARCH_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""' 2>/dev/null) || SEARCH_PATH=""
    if echo "$PATTERN" | grep -qE "(\\.orchestration|\\.patterns)"; then
      IS_SOURCE=false
    elif echo "$PATTERN" | grep -qE "\\*\\.(tsx?|jsx?|cs|css|scss|html|py|go|rs|vue|svelte)"; then
      IS_SOURCE=true
    elif [ -n "$SEARCH_PATH" ] && ! is_safe_path "$SEARCH_PATH"; then
      IS_SOURCE=true
    fi
    ;;
  Task)
    SUBTYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // ""' 2>/dev/null) || SUBTYPE=""
    if [ "$SUBTYPE" = "Explore" ]; then
      IS_SOURCE=true
    fi
    ;;
esac

if [ "$IS_SOURCE" = false ]; then
  exit 0
fi

# ─── Block source access before compaction grep ───
deny`;

export const HOOK_SCRIPTS = {
  'classify.sh': CLASSIFY_SCRIPT,
  'maintain.sh': MAINTAIN_SCRIPT,
  'guard-explore.sh': GUARD_EXPLORE_SCRIPT,
};

export const HOOKS_SETTINGS_CONFIG = {
  UserPromptSubmit: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: '{HOOKS_DIR}/classify.sh',
          timeout: 10,
        },
      ],
    },
  ],
  SessionStart: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: '{HOOKS_DIR}/maintain.sh',
          timeout: 30,
        },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: '{HOOKS_DIR}/guard-explore.sh',
          timeout: 5,
        },
      ],
    },
  ],
};

export function mergeHooksIntoSettings(existingSettings, hooksDir) {
  const settings = { ...existingSettings };

  const resolvedHooks = {};
  for (const [event, config] of Object.entries(HOOKS_SETTINGS_CONFIG)) {
    resolvedHooks[event] = config.map(entry => ({
      ...entry,
      hooks: entry.hooks.map(hook => ({
        ...hook,
        command: hook.command.replace('{HOOKS_DIR}', hooksDir),
      })),
    }));
  }

  settings.hooks = { ...(settings.hooks || {}), ...resolvedHooks };

  return settings;
}
