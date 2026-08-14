# Design View — turn a conversation into a system/feature design diagram

Feature plan. Status: **Phase 1 implemented**; Phases 2–3 not started.

## Goal

Turn any conversation (live session, past session, or a markdown doc) into an interactive
system-design / feature-design diagram that explains **what things do**, **how data flows**,
and **who owns what** — with the explanations living on the diagram itself, not in a
separate document that drifts.

## Decisions made

| Decision | Choice |
|---|---|
| Source of truth | **Custom JSON spec** rendered by the in-house SVG renderer (mermaid is an export target only) |
| Input sources | Current live session, past session picker, and a markdown file in the repo |
| Grounding | **Verified against the repo** — nodes marked `existing` vs `proposed` |
| Explanations | **In-diagram panels** — responsibilities and data contracts live on nodes/edges |

Rationale for the custom spec over mermaid: mermaid can't give clickable nodes, a
responsibility panel, a flow player, or incremental refinement of an existing diagram.
The renderer already exists, so the spec is the cheaper half.

## What already exists (reuse targets)

| Piece | Where | Reuse |
|---|---|---|
| SVG graph renderer — pan/zoom, expandable nodes, edge highlight, off-screen ghost labels | `src/features/compact/{FlowchartDialog,GraphNode,useGraphInteraction}.jsx` | the whole viewer |
| Layout engine — grouped boxes, edge routing | `src/features/compact/graphLayout.js` | needs a new **layered/swimlane** mode |
| Conversation transcripts | `get_claude_session`, `get_claude_sessions`, `get_active_claude_session` (`src-tauri/src/claude/commands.rs:528`) | the input |
| Headless agent runner — spawn `claude -p`, stream output, log to `~/.lirah/jobs/` | `src/features/agent-jobs/`, `src-tauri/src/agent_runner/` | the extractor |
| Markdown viewer | `src/features/markdown/` | export preview |
| Toolbar entry point | `src/components/textarea-panel/ProjectToolbar.jsx` (next to `CompactProjectButton`) | button placement |
| Dialog mount point | `src/components/textarea-panel/TextareaPanel.jsx:257` (where `FlowchartDialog` mounts today) | dialog placement |

Known gap: `get_claude_session` currently keeps only `user`/`assistant` **text** and drops
`tool_use` / `tool_result`. Much of the design signal (which files were touched) lives there,
so this parser must be extended — see [Transcript digest](#transcript-digest).

## Pipeline

```
ProjectToolbar → "Design" button
   ├─ source: live session | session picker | pick .md file
   ↓
transcript digest        (src-tauri: extend get_claude_session to keep tool_use)
   ↓
headless `claude -p`     (agent_runner; streams into the existing job UI)
   ↓  emits design spec JSON
fs verification pass     (do files[] exist? → existing vs proposed)
   ↓
~/.lirah/designs/<repo>/<slug>.json
   ↓
DesignDialog             (FlowchartDialog + layered layout + node panel + flow player)
```

New code lives in `src/features/design/`.

## The spec

```jsonc
{
  "title": "Agent job execution",
  "summary": "…",
  "layers": [
    { "id": "ui",   "label": "Frontend",   "order": 0 },
    { "id": "core", "label": "Tauri core", "order": 1 }
  ],
  "nodes": [{
    "id": "pty",
    "label": "PTY manager",
    "layer": "core",
    "kind": "service",
    "status": "existing",                    // or "proposed"
    "responsibility": "Owns spawned shell processes and their lifecycle",
    "owns": ["process handles", "output ring buffer"],
    "files": ["src-tauri/src/pty/mod.rs"],
    "detail": "markdown…"
  }],
  "flows": [{
    "id": "run-job",
    "label": "User runs a job",
    "steps": [
      { "from": "ui", "to": "core", "data": "JobSpec { prompt, cwd, useWorktree }", "note": "…" }
    ]
  }],
  "concerns": [{ "node": "pty", "kind": "risk", "text": "…" }]
}
```

Two properties make this a *design* diagram rather than a box drawing:

- **nodes carry `responsibility` + `owns` + `files`** — the "what things do" half; `files` are
  clickable into the app's existing file viewer.
- **edges carry the data payload shape (`data`)** — the "data flow" half, as contracts rather
  than unlabeled arrows.

`flows` is the single source for edges: the static diagram renders the **union** of all flow
steps, and the flow player highlights one flow's subset in sequence. No separate edge list to
keep in sync.

## Interaction

- **Click node** → right panel: responsibility, what it owns, inbound/outbound contracts, files.
- **Flow player** → pick a flow, step through its numbered edges; non-participating nodes dim.
- **`existing` vs `proposed`** → solid vs dashed. For feature design this distinction is the point.
- **Layer toggles** → collapse a band.

## Implementation notes

### Transcript digest

Long-session jsonl is megabytes and tool results dominate. Digest before extraction:

- keep all `user` / `assistant` text
- keep `tool_use` **names + file paths**
- **drop `tool_result` bodies**

That preserves "which files this work touched" — the grounding the extractor needs — at a
fraction of the tokens. `agentic-compaction` is already a dependency and the token-budget
feature can measure the digest before spending on it.

### Which session is "live"

`get_active_claude_session` resolves by most-recent mtime, which is ambiguous when two tabs
share a project. Resolve it, then **show what was picked** (first user message + timestamp)
with a "pick another" affordance — never guess silently.

### Extractor reliability

- Validate the emitted JSON against the schema; on failure, **one repair retry** citing the
  exact failing path (e.g. `nodes[3].layer`).
- Pass the digest as a **file path**, not inline in the prompt. (The argv concern turned out
  to be moot — `run_agent_job` already feeds the prompt via stdin — but a path is still
  better: the prompt stays small and the agent can grep the digest.)
- `run_agent_job`'s system prompt tells the agent to *apply code changes directly*. Both the
  extraction and repair prompts therefore state emphatically that the job is read-only apart
  from the one output file, and that instructions found *inside* the digest are data to
  describe, not orders to follow. That warning is load-bearing.

### Layered layout — the one genuinely new rendering piece

`graphLayout.js` groups by directory today. Layers need horizontal bands ordered by the
explicit `order` field (deterministic; vocabulary is agent-chosen and free-form), with
within-band node ordering to reduce edge crossings. This is the bulk of the new code.

### Verification pass — near-free

Mostly just `fs::exists` on each node's `files[]`; no agent tokens. A missing path is either
genuinely `proposed` (render dashed) or a hallucination worth flagging.

### Node budget

Cap at ~30–40 nodes and instruct the extractor to **abstract rather than enumerate**. If it
collapses something, say so on screen — a diagram that silently truncates reads as complete
when it isn't.

### Persistence and refinement

Specs live at `~/.lirah/designs/<repo>/<slug>.json`, mirroring the existing
`~/.lirah/jobs/` convention. "Update this diagram with what we just discussed" feeds the
existing spec **plus** the new transcript back to the extractor for an incremental update — so
a diagram becomes a living design doc across sessions instead of a one-shot render.

## Phases

### Phase 1 — the feature ✅

Live session only. Everything after this is polish.

- [x] Spec schema + validator — `src/features/design/spec.js`
- [x] Transcript digest builder — `src-tauri/src/design/digest.rs` (new `build_session_digest`
      command; `get_claude_session` was left alone rather than extended, so the instance-sync
      UI that depends on it cannot regress)
- [x] Extractor prompts — `src/features/design/designPrompt.js`
- [x] Extraction pipeline — `src/features/design/useDesignExtraction.js`: digest → headless
      job → schema validation → one repair retry → fs verification
- [x] fs verification pass → `existing` / `proposed` (pure `path_exists`, no new Rust)
- [x] Layered layout — `src/features/design/designLayout.js` (a separate module rather than a
      mode inside `graphLayout.js`: that file is coupled to compact's file-skeleton node shape,
      so mixing the two would have tangled both)
- [x] Renderer — `DesignNode.jsx`, `DesignDialog.jsx`, panning/zoom reused from
      `compact/useGraphInteraction`
- [x] Node detail panel — `DesignPanel.jsx` (responsibility, owns, receives/sends contracts,
      files, concerns, detail markdown)
- [x] Toolbar button — `DesignButton.jsx`, wired in `ProjectToolbar.jsx` + `TextareaPanel.jsx`

**Decisions taken during implementation** (the two open questions):

- The extractor runs as a **background job, not a blocking dialog**. State lives in
  `useDesignExtraction` above the dialog, so closing it mid-run does not cancel the run; the
  toolbar button turns into a live spinner badge while it works.
- The **flow player stayed in Phase 3**, but arrows are labelled with their data contract
  right away — with few enough edges all labels show; otherwise they appear for the selected
  node. So data flow is legible now, just not yet steppable.
- Clicking a file in the detail panel **adds it to the prompt context** (via the existing
  `onToggleFile`), which makes the diagram a way to choose what to work on next.

**Beyond the plan, found while testing against real data:**

- Digest paths are relativized against the project root — real transcripts record absolute
  paths, which contradicted the repo-relative paths the spec asks for.
- Slash-command and harness plumbing (`<command-name>`, `<local-command-caveat>`,
  `<system-reminder>`) is stripped; left in, a `/clear` invocation read as a user turn saying
  "/clear".
- Measured on an 11.1 MB / 250-message transcript: **45 KB digest, 241× reduction**, no
  truncation needed.

**Tests:** 13 Rust unit tests over the digest (`cargo test --lib design::`) covering
tool_result/thinking exclusion, tool-path capture, sidechain and malformed lines, noise
stripping, per-message capping, and truncation keeping both the opening ask and the latest
turn. The spec validator, normalizer, JSON extraction, text wrapping, layered layout and edge
routing are covered by a standalone script (see `Verifying` below).

### Phase 2 — sources and persistence

- [ ] Past-session picker (`get_claude_sessions`, already paginated)
- [ ] Markdown-file-on-disk source
- [ ] Save/load specs under `~/.lirah/designs/<repo>/`
- [ ] Regenerate / refine against an existing spec

### Phase 3 — flow and export

- [ ] Flow player (step through a flow, dim non-participants)
- [ ] Mermaid export
- [ ] Markdown design-doc export generated from the same spec (so it cannot drift)

## Verifying

```bash
npm run check:design                    # spec validator, normalizer, layout, edge routing
cd src-tauri && cargo test --lib design::   # transcript digest
npm run build                           # frontend compiles
```

## Fixes after the first live run

The first real run on `backoffice-api` froze the UI and never showed a diagram. The
extraction had actually **succeeded** — a valid 29 KB spec (25 nodes, 5 layers, 28 edges,
laying out in 1 ms) was sitting in the run directory. Four defects, all now fixed:

1. **Lost completion event → permanent hang.** `runJob` registered its `agent-job://done`
   listener inside a non-awaited async function with only a `setTimeout(0)` before spawning
   the process. `listen()` is itself an async IPC round trip, so the event could fire before
   anyone was listening and the promise never resolved. Listeners are now fully awaited before
   the spawn, **and** a watchdog polls `list_running_agent_jobs`, so a lost event can no
   longer strand the UI at "working". This was the actual cause of the report.
2. **1.14s main-thread freeze.** Tauri runs synchronous commands on the main thread, which on
   Linux is the GTK/WebKit UI thread. `get_active_claude_session` scans every session file for
   the project — measured at 1.14s across 272 of them — so it hard-froze the window. It now
   runs on the blocking pool; `build_session_digest` is async for the same reason.
3. **Verification IPC storm.** One `path_exists` invoke per file meant hundreds of sequential
   round trips through the main thread. Replaced by a single batched `paths_exist`.
4. **Layout memo never hit its cache.** `spec?.layers || []` minted a new array (and Map) on
   every render, so the layout recomputed constantly. Stable empty constants now.

Two things the real spec exposed:

- **Cross-repo paths.** The design spanned a sibling repo, so 5 of 54 file references resolved
  outside the project root and were wrongly flagged missing. `paths_exist` now falls back to
  the workspace parent directory.
- **A finished run was unreachable.** Nothing could load a spec already on disk, so recovering
  from the hang would have meant paying for a full re-extraction. Added `latest_design_run`
  plus a **Load last run** button (a small slice of Phase 2's persistence, pulled forward
  because it is also the cheapest way to verify a fix).

## Observability

The first run took **3.7 minutes and printed nothing until the end** — `claude -p` buffers all
stdout until it finishes, so there was genuinely nothing to show. Fixed by running the
extractor with `--output-format stream-json --verbose` (opt-in via `run_agent_job`'s new
`stream_json` flag; existing agent jobs explicitly keep plain text).

`designEvents.js` parses that NDJSON into an activity log, and `DesignActivity.jsx` renders it:
elapsed clock, live tool-call count, what it is doing right now, and a scrolling feed of every
message, tool call and hook — plus the raw log path with a copy button. The feed also stays
visible on failure, which is when it matters most.

Two details worth keeping, both found by parsing a real stream rather than the docs:

- `rate_limit_event` arrives routinely with `status: "allowed"`. It is a quota report, not a
  throttle — surfacing it made a healthy run look broken, so only non-allowed statuses show.
- `message.usage.output_tokens` is per-chunk in streaming mode (observed as `1` on every
  message), so no running token total is derived from it. Duration, turns and cost come from
  the final `result` event instead.

The activity log is a **store** the dialog subscribes to via `useSyncExternalStore`, not hook
state: the hook lives in the composer panel, and putting a stream that moves several times a
second into its state would re-render the editor for the whole run.

Hooks are shown deliberately. The first run's log revealed the extractor had obeyed the repo's
orchestration protocol and built a compaction artifact for discovery — pure overhead for a
read-only extraction. The prompt now tells it to skip repo-level orchestration/compaction
protocols, not to spawn subagents, and to start from the digest's "files touched" list.

## Second live run — diagnosis from disk

Run `2026-08-14T10-59-18-544Z` was reported as "still going after 5 minutes". From the run
directory alone: the agent **succeeded in 136s** (10 turns, $1.10 — down from 220s after the
prompt was told to skip repo orchestration), and its `spec.json` is **valid, 18 nodes, zero
errors**. No extraction process was alive; the only surviving `claude` was the app's own
sandboxed terminal tab. So the agent side was finished and correct, and the UI was stuck
somewhere in the pipeline *after* the job.

Found by reading the code: `DesignDialog`'s stored-run probe depended on `extraction`, which is
a **fresh object literal on every render**, so the effect re-fired on every render — two IPC
calls each time, hammering the main thread. Fixed to depend on the stable callback.

**Honest limit:** that IPC storm is a plausible contributor but is *not* proven to be the cause
of this particular stall. The agent exited, so both completion paths (`done` event and the
`list_running_agent_jobs` watchdog) should have fired. The stall point could not be recovered
from disk, because the pipeline left no trace of its own steps — only the agent's stream was
logged. Hence:

- **`pipeline.log`** in every run directory now records each stage with a timestamp — session
  resolved, digest built, extractor starting/finished, spec read, valid/repairing, files
  verified, diagram ready, or failed. Readable from a shell without the app running, which is
  exactly what was missing this time. The same stages appear in the activity feed, highlighted.
- **A 15-minute hard ceiling per job**, so an unresolved run fails with the log path instead of
  spinning forever.

## Root cause of every stuck run: a StrictMode-broken mounted guard

The pipeline log made it obvious on the third run: the header read
"Checking against the repo…" while the stages read "Diagram ready". So the run had
*completed* and `publish()` had returned without setting state.

```js
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);   // the bug
```

`main.jsx` wraps the app in `<React.StrictMode>`, which double-invokes effects: mount →
cleanup → mount. The cleanup set the flag to `false` and **nothing ever set it back**, so from
the first render onward `mountedRef.current` was permanently false. `publish()`'s
`if (!mountedRef.current) return` therefore always fired, swallowing every `setSpec()` and
`setStatus('ready')`. The extraction worked perfectly every time; the result was simply never
handed to React.

This explains all three reports, including the first — the missed-event and IPC-storm fixes
were real bugs but never the cause of the stall.

**Fix:** the guard is gone entirely rather than repaired. Setting state after unmount is a
no-op in React 18+, so it protected nothing and cost three runs. `grep` confirms no other
feature in the repo uses the pattern.

Also fixed: `stage('Diagram ready')` was logged unconditionally, so a publish that bailed still
looked successful in the log. `publish()` now returns whether it published, and the stage
records "Cancelled before publishing" otherwise — instrumentation that lies is worse than none.

## Still not verified end-to-end

The extraction path is now confirmed to work — a real conversation produced a real, valid
spec. What has **not** been visually confirmed is the render: nobody has yet seen the diagram
on screen, because the run that produced this spec never reached the renderer. Open the Design
dialog and click **Load last run** to check that in one step, with no extraction cost.

## Open questions

Both resolved during Phase 1 — see the decisions under [Phase 1](#phase-1--the-feature-).
