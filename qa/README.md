# Agentic QA

A cheap model (Haiku) uses a real, throwaway Lirah instance the way a user would, following one recipe per feature, and reports which steps broke. Nothing here reads source code: if the app still does what the recipe says, it passes.

- `index.md`: every feature and its recipe. Only recipes linked there run.
- `recipes/<feature>.md`: what a user does and what they should see after each step.
- `AGENT.md`: the instructions Haiku runs recipes with.
- `WRITING.md`: how recipes get written: by Opus, through `/qa-recipes <feature>|missing|all`.

## Requirements

- The dev setup from the main README (`npm install`, a Rust toolchain, the Tauri system packages), since QA runs `tauri dev`.
- The [Claude Code](https://claude.com/claude-code) CLI on your `PATH` and logged in (`claude`). Recipes run on Haiku, billed to that account, about $0.005 each.
- Linux or macOS with a desktop session: the app opens a window. The control channel exists on Windows too (a named pipe), but `scripts/qa.mjs` is Unix-only: it looks for a `.sock` file in the temp profile, sets `HOME` and joins `PATH` with `:`. Tested on Linux.

## Running

```
npm run qa                 # every recipe in index.md, one fresh instance each (~45 s and ~$0.005 per recipe)
npm run qa -- tasks tabs   # recipes whose file name contains a word
npm run qa -- --up         # start one instance and keep it up, to drive by hand or write a recipe
QA_MODEL=sonnet npm run qa # a stronger model when a recipe is too subtle for Haiku
```

Exit code 1 when any recipe fails. A failed recipe keeps its profile and `app.log` in the printed `/tmp/lirah-qa-*` folder.

## How it works

- `scripts/qa.mjs` starts `tauri dev` with `HOME` set to a temp folder, so each run gets a clean `~/.lirah` and never touches your real tabs, tasks or settings. The profile is seeded with `autoLaunchCli: false` (tabs open a plain shell) and a small git project at `~/project`, starred.
- The app runs with `LIRAH_QA=1`, which unlocks `lirah qa ...` on its control socket (`src-tauri/src/agent_control.rs` refuses it otherwise). The commands live in `src/features/agent-control/qaDriver.js`: the screen as a numbered text outline, click, type, keys, wait, and terminal read/type.
- Each recipe goes to `claude -p --model haiku` with `AGENT.md` as the system prompt, Bash limited to `lirah` and `sleep`, and a JSON result per step.
- The window opens on your desktop while recipes run. It paints nothing when there is no GPU, which is fine: the agent reads the page, not pixels.

## Writing recipes

Run Opus with `/qa-recipes <feature>` (or `missing` for every feature without a recipe). It follows `WRITING.md`: it walks the feature in a live instance, writes the recipe, makes sure Haiku passes it twice, breaks the feature on purpose to check the recipe catches it, then links it in `index.md`.

## Driving by hand (or from a coding agent)

```
npm run qa -- --up                    # prints the two exports for another shell
export PATH=... LIRAH_CONTROL=...
lirah qa snapshot                     # [12] button "New tab" ...
lirah qa click 12
lirah qa type 36 'Buy milk'; lirah qa key Enter
lirah qa wait 'Buy milk'
lirah qa terminal; lirah qa terminal-type 1 'ls' --enter
```

The driver runs in the page, so frontend edits need a restart of the instance (Ctrl+C, `--up` again) to reach it.
