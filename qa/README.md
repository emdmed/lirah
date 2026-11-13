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
npm run qa                 # every recipe in index.md on the shared instance, reset between recipes (~$0.005 per recipe)
npm run qa -- tasks tabs   # recipes whose file name contains a word
npm run qa -- --up         # attach to or start the instance, print its `lirah` wrapper path and exit
npm run qa -- --status     # show the registered instance; exit 0 only if it answers `qa whoami` with our token and home
npm run qa -- --down       # stop the instance (its profile folder stays)
npm run qa -- --fresh      # --down, then start a new instance
QA_MODEL=sonnet npm run qa # a stronger model when a recipe is too subtle for Haiku
```

There is one QA instance per machine, registered in `$TMPDIR/lirah-qa/instance.json`. Every run attaches to it if it is alive and its `qa whoami` token matches, and starts it otherwise (the first start compiles Rust and can take minutes). It keeps running after the run ends, until `--down`. Two runners at once don't start two instances: the second waits on `instance.lock`.

Exit code 1 when any recipe fails. A failed recipe keeps the tail of `app.log` and its `~/.lirah` in the printed `$TMPDIR/lirah-qa/runs/<recipe>-<time>/` folder.

## How it works

- `scripts/qa.mjs` starts `tauri dev` with `HOME` set to a temp folder, so it never touches your real tabs, tasks or settings. The profile is seeded with `autoLaunchCli: false` (tabs open a plain shell) and a small git project at `~/project`, starred.
- Between recipes, `lirah qa reset` closes dialogs and tabs, drops the workspaces and reloads the page; the runner then wipes tasks, plans and jobs and rewrites the seed, so every recipe starts from a fresh-looking app (no tabs, one workspace). If the page doesn't come back clean within 30 s, the runner restarts the instance.
- The app runs with `LIRAH_QA=1` and a random `LIRAH_QA_TOKEN`, which `lirah qa whoami` echoes with its `HOME`, so a runner can tell its instance from your real Lirah or a stale socket. `LIRAH_QA=1` unlocks `lirah qa ...` on its control socket (`src-tauri/src/agent_control.rs` refuses it otherwise). The commands live in `src/features/agent-control/qaDriver.js`: the screen as a numbered text outline, click, type, keys, wait, and terminal read/type.
- Each recipe goes to `claude -p --model haiku` with `AGENT.md` as the system prompt, Bash limited to `lirah` and `sleep`, and a JSON result per step.
- The window opens on your desktop while recipes run. It paints nothing when there is no GPU, which is fine: the agent reads the page, not pixels.

## Writing recipes

Run Opus with `/qa-recipes <feature>` (or `missing` for every feature without a recipe). It follows `WRITING.md`: it walks the feature in a live instance, writes the recipe, makes sure Haiku passes it twice, breaks the feature on purpose to check the recipe catches it, then links it in `index.md`.

## Driving by hand (or from a coding agent)

```
npm run qa -- --up                    # prints the wrapper, e.g. /tmp/lirah-qa-AbC123/qa-bin/lirah
L=/tmp/lirah-qa-AbC123/qa-bin/lirah   # use the printed path
$L qa whoami                          # qa: true, token and home: check it before driving
$L qa snapshot                        # [12] button "New tab" ...
$L qa click 12
$L qa type 36 'Buy milk'; $L qa key Enter
$L qa wait 'Buy milk'
$L qa terminal; $L qa terminal-type 1 'ls' --enter
```

The wrapper pins `HOME` and `LIRAH_CONTROL` to the QA instance and unsets `LIRAH_PTY_SESSION` and `LIRAH_WORKSPACE`, so it is safe from inside a Lirah tab: no exports needed. Don't start a second instance; `--up` attaches to the running one. Frontend edits reach it on the next `$L qa reset` (it reloads the page), Rust edits need `--fresh`.
