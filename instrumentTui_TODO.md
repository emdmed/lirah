# Instrument TUI — implementation plan

Target: the "01 · Instrument TUI" board and its component sheet "01b" on the
design canvas (https://claude.ai/artifact/3656Y3r9hSLA3DdCtRmCDk).

**One-line thesis:** keep the TUI layout (titles set into pane borders, `[label]`
buttons, keyboard-first, zero radius on chrome) and add analog parts only where
they carry meaning: one glass screen (the terminal), printed panel legends,
lamps for state, a meter for quantities that have a ceiling, and keycaps for keys.

This matches the brief already written in `index.html:15-31` ("lab instrument …
glow scarce, reserved for live values and lit state"). It contradicts the
"never a bevel, glow or shadow" comment in `src/index.css:84-88`. This plan
settles that in favour of the `index.html` brief.

---

## Status legend
`[ ]` todo · `[~]` in progress (one at a time) · `[x]` done · `[-]` cancelled

---

## Decisions (all confirmed 2026-10-14)

| # | Decision | Confirmed choice | Why |
|---|----------|----------------|-----|
| D1 | Content font | **Keep Typestar OCR** for content (UI and terminal). Add one legend face. | Typestar is the app's identity. The mockups used JetBrains Mono only because the canvas couldn't load the local OTF. |
| D2 | Legend face | **Barlow Semi Condensed 600**, bundled as woff2 in `public/fonts/` (OFL licence) | The app is offline Tauri. Google Fonts already fail silently offline (`index.html:7-10`). |
| D3 | Lamp colour per theme | **Derive from the theme's terminal ANSI `brightYellow`**, with optional `ui.lamp` override | Works for all 17 themes with no hand-tuning. Kanagawa gives `#E6C384`. To get the mock's `#FFA066`, add an override. |
| D4 | What the status-bar meter measures | **Context-window fill** (new backend field, phase 7). Fall back to daily budget when context isn't available. | Today the app has no context data; the only percentage is session billable ÷ *daily* budget, which mixes units (see Findings). |
| D5 | Lucide icons in chrome | **None in chrome rows** (title bar, tab bar, status bar, sidebar header, pane legends). They are allowed inside pane action buttons and dialogs. | This keeps your uncommitted `Send`/`RotateCcw`/`ScrollText` icon buttons (they are in-pane actions), while giving chrome one voice. |
| D6 | Job progress display | **Drop the LED ladder from the mock.** Use lamp, elapsed time and a `+a −r` diff bar. | Jobs have no progress, percent or step data (`AgentJobsContext.jsx:576-592`). A ladder would be invented. |

---

## Findings that shaped the plan

- **Shell composition:**
  - `RightSidebar` is mounted at App level (`App.jsx:148`), outside each tab's `Layout`.
  - `TabBar` renders only when there is more than one tab (`App.jsx:126`).
  - The gutter colour therefore has to be set at App level as well as in `Layout`.
- **Token data:**
  - `useTokenUsage` returns *session-cumulative* billable tokens. `checkBudgetStatus` divides that by a *daily* limit (`TokenBudgetContext.jsx:80-89`).
  - Nothing tracks current context size.
  - The Rust parser (`src-tauri/src/fs/tokens.rs`) already reads per-message `usage`, so "last message input + cache_read + cache_creation" is cheap to add.
  - StatusBar shows **no** token figures today. They live in the prompt pane's bottom border (`TextareaPanel.jsx:267-274`).
- **Job states:** `running | done | applied | conflict | failed | cancelled | interrupted`, plus `typecheck.status`. Each job has `startedAt/endedAt` and `diffStat {added, removed}`.
- **Rules that will fight the design:**
  - `*:not(.rounded-full){border-radius:0 !important}` (`index.css` ~:178) blocks the glass radius and keycap radius.
  - `* { border-color: … }` in `@layer base` restyles every border.
  - The `@theme` block sets all `--shadow-*` to none. Custom classes are unaffected.
- **xterm:**
  - Background = `theme.terminal.background` (`useTerminal.js:64-72`), opaque.
  - The container div has no padding. Insets come from the `.tui-pane` wrapper.
  - The FitAddon measures the `ref` div, so padding must sit on a parent, not on the ref div.
- **Primary colour overload:**
  - `--color-primary` drives focus outlines, caret, `.tui-key`, the focused pane frame, active tab fill, status project block, DialogTitle (`ui/dialog.jsx:115`), button `default` variant, dropdown focus and selection tints.
  - About 60 call sites (see "Primary audit" in phase 8).
- **Dead or wrong code to clean up while there:**
  - Never used: `chassis-well`, `chassis-cut`, `panel-recess`, `edge-e-engraved`, `lit`.
  - `.patterns/styling.md` references `border-sketch`, which doesn't exist.
  - `edge-engraved/50` and `edge-engraved/30` do nothing (`HistoricalBrowser.jsx:109,124`, `ProjectComparison.jsx:102`).
  - `ThemeContext` writes `--color-flowchart: [object Object]`, and its fallback is `'kanagawa'` instead of `defaultTheme`.
  - The `dark:` variant is dead because nothing sets `.dark`.
  - In `dialog.jsx:55-56` both branches of the `instant` ternary are identical.
  - `TextareaArea`'s `footerInfo` and `isWide` props are never used.
- **No JS test runner** (`scripts/check-design.mjs` is a node-assert script). Verification is visual plus a new node contrast script (phase 9).
- **Your uncommitted work** (must not be clobbered):
  - `TextareaArea.jsx`: icon send/clear buttons with dim key hints.
  - `TextareaPanel.jsx`: `ScrollText` preview toggle.
  - `ui/tooltip.jsx`: plain `<kbd>` inside tooltips.
  - `index.css`: 4px quiet scrollbars.

---

## Implementation notes (2026-10-14)

- Done on branch `feat/instrument-tui`. 0.1 was committed as its own commit; everything else is uncommitted, waiting for review.
- Still open: 0.3/9.4 screenshots (they need the Tauri app running), 10.7 optional cleanup (ask first), and bundling Grenze Gotisch (1.5, ask). Grenze still loads from Google Fonts.
- Deviations from the plan:
  - The Glass preference is applied as `data-glass="flat"` on `<html>`, not as a per-wrapper `.ins-glass-flat` class. The class also works.
  - The pane face is an inset background on `.tui-pane`, not a separate element.
  - RaceGroup keeps full candidate cards (they carry lamp, duration and diff bar) inside the bracket frame, not compact rows, because candidates need their review/keep actions.
  - Added `ui.ok`/`ui.warn`/`ui.fault` theme overrides (9.2). In several themes the ANSI colours were too close in lightness, and emerald-mono had ok = warn = fault.
  - Muted foreground was nudged in tokyo-night, everforest, rose-pine and catppuccin-latte. The catppuccin-latte lamp is `#c2410c`, not `#fe640b`, to meet ΔL ≥ 25.
  - `footerInfo` and `isWide` were removed from TextareaArea. `footerInfo` was rendered there but never passed in.

## Phase 0 — Prep

- [x] **0.1** Commit (or stash) the 4 uncommitted files as their own commit ("prompt actions: icon buttons, quiet scrollbars") so the redesign diff starts clean.
- [x] **0.2** Branch `feat/instrument-tui` from `main`.
- [ ] **0.3** Baseline screenshots in `npm run dev`. Capture kanagawa, tokyo-night (default), retro, flexoki (light) and catppuccin-latte (light), each in these states:
  - idle
  - terminal focused
  - prompt focused
  - jobs pane open with a running race
  - a dialog open
  - Ctrl held (key bar)

  Store them in `docs/design/baseline/` (gitignored, or not, your call).
- [x] **0.4** Confirm decisions D1–D6. All six were accepted as recommended on 2026-10-14.

---

## Phase 1 — Material tokens (`src/index.css`, `ThemeContext.jsx`, `theme-config.js`)

Every new value derives from the active theme, so all 17 themes get the look at once.

- [x] **1.1** Add `--ins-*` tokens in `:root` (next to `--tui-*`, `index.css:91-100`):
  ```css
  --ins-gutter:      color-mix(in srgb, var(--color-background) 78%, #000);   /* dark */
  --ins-panel:       var(--color-background);
  --ins-raised:      color-mix(in srgb, var(--color-background) 94%, var(--color-foreground));
  --ins-well:        color-mix(in srgb, var(--color-background) 88%, #000);
  --ins-glass:       var(--color-terminal-bg);           /* set by ThemeContext, see 1.3 */
  --ins-edge:        color-mix(in srgb, var(--color-background) 84%, var(--color-foreground));
  --ins-edge-strong: color-mix(in srgb, var(--color-background) 70%, var(--color-foreground));
  --ins-legend:      color-mix(in srgb, var(--color-foreground) 85%, var(--color-background));
  --ins-lamp:        var(--color-lamp);                  /* set by ThemeContext */
  --ins-ok / --ins-warn / --ins-fault                    /* set by ThemeContext from ANSI */
  --font-legend: "Barlow Semi Condensed", var(--font-mono);
  ```
  - Light themes (`data-theme="light"`): override `--ins-gutter` to `color-mix(bg 92%, fg)` and `--ins-well` to `color-mix(bg 95%, fg)`.
  - Add a `:root[data-theme="light"]` block. That attribute is already set by `ThemeContext.jsx:29` but no CSS uses it yet.
- [x] **1.2** Remap the old aliases so the ~95 existing `edge-*-engraved` and `chassis-rail` users pick up the new look without touching their files:
  - `--tui-line` → `var(--ins-edge)`
  - `--tui-line-strong` → `var(--ins-edge-strong)`
  - `--tui-bar` → `color-mix(in srgb, var(--ins-gutter) 60%, var(--ins-panel))`
  - `--glow` → `var(--ins-lamp)`
- [x] **1.3** In `ThemeContext.jsx` (effect at :10-37), alongside the `ui` loop:
  - Set `--color-terminal-bg` = `theme.terminal.background`.
  - Set `--color-lamp` = `theme.ui.lamp ?? theme.terminal.brightYellow`.
  - Set `--color-ok`, `--color-warn`, `--color-fault` from `terminal.brightGreen`, `brightYellow` and `brightRed`. The `--color-status-*` globals at `index.css:63-66` are Kanagawa-only today. Point them at these vars so toasts, StatusBar and the token banner theme correctly.
  - Skip non-string `ui` values. This fixes the `--color-flowchart: [object Object]` write.
  - Fall back to `defaultTheme` instead of `'kanagawa'` (:14).
- [x] **1.4** `theme-config.js`: add optional `ui.lamp` to themes where brightYellow reads poorly as a lamp. Candidates to eyeball:
  - kanagawa → `#FFA066` (the mock)
  - retro → keep `#F4F7A3`
  - hackerman and emerald-mono (mono-green themes) → check
  - the two light themes → a darker amber, for contrast on light panels

  Document the key in the Kanagawa block comment.
- [x] **1.5** Fonts:
  - Add `public/fonts/BarlowSemiCondensed-SemiBold.woff2` (OFL) and an `@font-face` next to Typestar (`index.css:4-9`).
  - Remove the Source Code Pro Google link from `index.html` (it is a fallback only).
  - Leave Grenze Gotisch (wordmark) or bundle it too. Ask.
- [x] **1.6** Radius rule: change `*:not(.rounded-full)` to `*:not(.rounded-full):not(.ins-round)`. Glass and keycaps opt in with `.ins-round`. Chrome stays square.
- [x] **1.7** Delete the unused `chassis-well`, `chassis-cut`, `panel-recess`, `edge-e-engraved` and `lit`. Rewrite the header comment at `index.css:84-88` to state the new material rule: *flat chrome; one glass screen; lamps only for live state.*

**Accept:** app looks almost unchanged except darker gutters and themed status colours. No layout shift. Switching between all 17 themes produces no console errors.

---

## Phase 2 — Primitives (new shared components + CSS)

Rules (`.patterns/components.md`): PascalCase files, named exports, live in
`src/components/instrument/`, **no index.js**, import each file directly.

- [x] **2.1 CSS classes** (`index.css`, in `@layer components`):
  - `.ins-legend`: `font-family: var(--font-legend)`; 600 weight; 11px; `letter-spacing: .16em`; uppercase; `color: var(--ins-legend)`.
  - `.ins-cap`:
    - inline-flex, 16px tall, `min-width: 16px`, `padding: 0 4px`;
    - `border: 1px solid var(--ins-edge-strong)` with `border-bottom-width: 2px`;
    - `border-radius: 2px` plus the `.ins-round` exemption;
    - `background: var(--ins-raised)`, 10px mono.
    - `.ins-cap[data-lit]`: lamp border and text.
    - `.ins-cap[data-down]`: 1px travel (translateY 1px, bottom border 1px).
  - `.ins-lamp`:
    - 7px circle; off = `color-mix(fg 18%, bg)` with an inset shade.
    - `[data-state=on|ok|warn|fault]` sets background plus `box-shadow: 0 0 6px <colour>`.
    - `[data-blink]` = `steps(1)` animation at 1Hz, disabled under `prefers-reduced-motion`.
  - `.ins-well`: `background: var(--ins-well)`; `box-shadow: inset 0 1px 2px rgb(0 0 0 / .45)`.
  - `.ins-glass`:
    - `background: var(--ins-glass)`; `border-radius: 6px` (`.ins-round`);
    - `box-shadow: inset 0 0 0 1px rgb(0 0 0 / .5), inset 0 10px 28px rgb(0 0 0 / .45), 0 1px 0 rgb(255 255 255 / .04)`.
    - Light-theme variant: lighter inset values.
  - `.ins-seg` was planned for job ladders but is cut by D6. Skip it.
- [x] **2.2** `Keycap.jsx`**: `Keycap({ children, lit = false, down = false, className })` renders `<kbd className="ins-cap ins-round">`.
  - Also `KeyChord({ keys: ['^','⇧','P'], label })` for repeated chord-plus-label rows (KeyHintBar, prompt footer, dialogs).
  - Using `<kbd>` means your uncommitted tooltip rule (`ui/tooltip.jsx:41`) automatically flattens keycaps inside tooltips. That is the intended behaviour.
- [x] **2.3** `Lamp.jsx`**: `Lamp({ state = 'off', blink = false, label })` renders `<span className="ins-lamp" data-state data-blink role="img" aria-label={label}>`.
  - Also export `JOB_LAMP = { running:'on'+blink, done:'ok', applied:'ok', conflict:'warn', interrupted:'warn', failed:'fault', cancelled:'off' }`.
- [x] **2.4** `Meter.jsx`**: `Meter({ value, max, warnAt = .8, label, format })`.
  - Ticks every 10% with a major tick at 50%, drawn as `repeating-linear-gradient`.
  - The fill bar is 3px: foreground colour, warn colour at ≥ warnAt, fault colour at ≥ .95.
  - The red zone is hatched from warnAt.
  - The needle is a lamp-coloured triangle, `transition: left 120ms ease-out`.
  - Readout uses tabular numerals (`48.2k/200k`).
  - Root is `role="meter"` with `aria-valuenow/min/max`.
- [x] **2.5** `ToggleSwitch.jsx`**: `ToggleSwitch({ checked, onChange, label, tone = 'ok' })`. A real `<button role="switch" aria-checked>`, a 24×12 track (`.ins-well`, `.ins-round`), and a 10px knob coloured by tone when on.
- [x] **2.6** `PaneLegend.jsx`**: `PaneLegend({ index, title, status, lit })`, rendered as the first child of a `.tui-pane`.
  - Left side: a Keycap with the index, then the title in `.ins-legend`, positioned on the top border line.
  - Right side: optional status text and a Lamp, also on the border.
  - Replaces the `::before { content: attr(data-title) }` pseudo-element. Keep `data-title` as a fallback for CommandPalette and dialogs.

**Accept:** temporary dev route or Storybook-less scratch file `src/dev/InstrumentKit.jsx`, mounted behind `?kit` in `main.jsx`, that reproduces board 01b. Delete it in phase 10, or keep it behind the flag.

---

## Phase 3 — Pane frame (`.tui-pane`)

- [x] **3.1** Rework `.tui-pane` (`index.css:374-429`):
  - Background `var(--ins-panel)`.
  - Frame `::after` at `inset: 6px 0`, `1px solid var(--ins-edge)`. Keep the geometry so padding doesn't shift.
  - `--pane-bg: var(--ins-gutter)`. The legend masks the line with the *gutter* colour because it sits outside the panel face.
  - Remove `::before` when `[data-legend]` is present (`.tui-pane[data-legend]::before{content:none}`).
- [x] **3.2** Lit state: `:focus-within` and `.terminal-live` no longer recolour the whole frame to primary. They:
  - set `[data-lit]` on the legend keycap, via CSS `.tui-pane:focus-within .ins-cap{…}`, with no JS;
  - light the legend lamp;
  - shift the frame to `--ins-edge-strong`.

  Hierarchy then comes from the lamp, not from a blue box.
- [x] **3.3** Mount `PaneLegend` in the 5 panes:

  | Pane | Location | Legend | Status text |
  |---|---|---|---|
  | `Terminal.jsx:71` | — | `2 TERMINAL` | `live`, lit when `isFocused` |
  | `LeftSidebar.jsx:68` | inside `<Sidebar>`, before `SidebarHeader` | `1 FILES` | `agent` / `nav` (moved out of SidebarHeader) |
  | `TextareaPanel.jsx:367` | — | `3 PROMPT` | — |
  | `RightSidebar.jsx:416` | — | `4 JOBS` or `4 AGENTS` | `{n} running` |
  | `SecondaryTerminal.jsx:68` | — | `TERMINAL 2` | no index cap |
- [x] **3.4** `PaneInfo` stays. Restyle `.tui-pane-info` to 11px muted on `--pane-bg`. No API change.
- [x] **3.5** Gutter:
  - `Layout.jsx:3` root gets `bg-[var(--ins-gutter)]`.
  - Body row gap goes from `gap-1 pl-1 pt-1 pb-1` to `gap-1.5 p-2 pb-1.5`. Pane legends need about 8px above the frame.
  - In `App.jsx:137` the row wrapper also gets the gutter background.
  - `RightSidebar` root `m-1` (:412) becomes `my-2 mr-2` to match.
- [x] **3.6** `ThemeContext.jsx:32` sets `body` background to the terminal background. Change it to read `--ins-gutter` via CSS (`body{background:var(--ins-gutter)}`) and drop the inline style, so the window edges match the gutter.

**Accept:** focus moves (Alt+1–4) light exactly one legend. No double lines between neighbouring panes. Pane content does not move by more than 2px versus the baseline.

---

## Phase 4 — Terminal glass (`Terminal.jsx`, `SecondaryTerminal.jsx`, `useTerminal.js`)

- [x] **4.1** Wrap the xterm ref div (`Terminal.jsx:85-92`) in `<div className="ins-glass ins-round flex-1 min-h-0 p-[10px_14px] overflow-hidden">`.
  - The ref div stays 100%×100% with no padding, so FitAddon measurement is unchanged.
  - The pane wrapper padding goes from `px-2 pb-3` to `px-2.5 pb-3`.
- [x] **4.2** xterm background must equal the glass background, or the WebGL canvas paints a mismatched rectangle. Both read `theme.terminal.background` already (1.3 sets `--ins-glass` from it), so this works by construction. Verify it with the WebGL renderer *and* after the context-loss fallback (`useTerminal.js:525-540`).
- [x] **4.3** Cursor colour: leave `theme.terminal.cursor` alone. That's the user's theme. The **prompt** caret (`.tui-caret`) switches to `--ins-lamp` (phase 6).
- [x] **4.4** `TerminalSearchBar` (absolute overlay): re-anchor it inside the glass, top-right, 8px inset. Give it `.ins-raised` background and an `--ins-edge` hairline, instead of `edge-engraved` on canvas.
- [x] **4.5** SecondaryTerminal:
  - Same glass wrapper (`:75-78`).
  - Its outer `borderLeft: 1px solid var(--color-border)` (:98-100) becomes a gutter gap (`ml-1.5`), because the pane frames separate it now.
  - The maximize button becomes a keycap-styled icon button. Lucide `Maximize2` is OK here (in-pane control, D5).
- [x] **4.6** Settings toggle "Glass" (default on) in StatusBar menu → Preferences, stored via `useTerminalSettings` as `instrumentGlass`. When off, add `.ins-glass-flat` (no radius, no inset shade). It doubles as an escape hatch if WebGL edge artifacts show up.

**Accept:**
- No 1px seam between the glass and the xterm canvas in any theme, at 100% and 125% zoom.
- Resizing the window keeps cols×rows correct (PaneInfo matches `stty size`).
- Tab-switch WebGL rebuild still works.

---

## Phase 5 — Shell chrome

- [x] **5.1 TitleBar.jsx**:
  - Left: a Lamp (`on` when any terminal session is live, otherwise `off`), the `LIRAH` legend, and the current path in muted text.
  - Right: three `Keycap`-styled `<button>`s (`_ □ ×`), each with an `aria-label`. Close hover = fault colour.
  - Drop the inline `theme.background`/`foreground` styles. Use `bg-[var(--tui-bar)]` and an `--ins-edge` bottom hairline.
  - The prop `theme` becomes unused. Remove it at the call site, `ProjectTab.jsx:994`.
- [x] **5.2 TabBar.jsx**:
  - Each tab is `Keycap(idx+1)` plus its label. Active = lit keycap, foreground label, and a 2px lamp underline. **No more `bg-primary` block.**
  - The close `×` stays hover-revealed.
  - `[+]` is unchanged (`tui-btn`).
  - Still rendered only when there is more than one tab.
- [x] **5.3 StatusBar.jsx** (`:259-470`):
  - Project block (:269-271): `bg-primary` fill becomes `Keycap lit` (tab index) plus the project name in foreground.
  - Workspace (:272-284): drop the `Layers` icon. Use a `WS` legend plus the name.
  - Branch: keep `± main*`. The `*` (dirty marker) uses `--ins-warn`.
  - Tasks and update: drop `ListTodo` and `ArrowUpCircle` from the chrome row. Use text `[tasks]` and `[update v1.2.3]` with an `ok` lamp.
  - Jobs (:350-360): lamp (`on`+blink if any running) plus `jobs 2`.
  - **Meter** (new, right side): `CTX` legend plus `<Meter>`. Data comes from phase 7. Until phase 7 lands, show the budget meter only when a daily budget is set; otherwise hide it.
  - Sandbox and network (:381-384): `SANDBOX` legend plus `<ToggleSwitch tone=ok>`, and `NET` plus `<ToggleSwitch tone=warn>` when sandbox is on. Keep the existing confirm dialogs (:474-488). Sandbox `fail` = fault lamp next to the switch.
  - CLI (:370-379): `ok` lamp plus `claude` / `opencode`.
  - Separators: the `│` glyphs (:295, 358, 367, 380) stay, using `--ins-edge-strong`.
  - Menu trigger: `[menu]` stays. The dropdown section labels become `.ins-legend` at 10px.
  - `Changelog` status: keep RetroSpinner, but recolour its second square to `--ins-lamp` (`RetroSpinner.jsx:22`).
  - Remove the now-unused lucide imports. Keep those still used inside menu items (Palette, Keyboard and so on are fine: they're inside a dropdown, which is dialog-class under D5).
- [x] **5.4 KeyHintBar.jsx**:
  - Render each hint with `KeyChord` (keycaps) instead of `.tui-key` coloured text.
  - Height matches the status bar (`h-8`), so the overlay still covers it exactly.
  - `alt 1–4 panes` uses keycaps too.
- [x] **5.5** Window height budget: title 30, tabs 28, status 32. Do not grow the status bar to the mock's 34px, because KeyHintBar and TokenAlertBanner (`top:32px`) assume 32.

**Accept:**
- Status bar shows no lucide icons.
- Every switch is operable by keyboard and announces its state.
- Holding Ctrl shows the keycap bar, pixel-aligned over the status bar.

---

## Phase 6 — Pane contents

- [x] **6.1 LeftSidebar / SidebarHeader**:
  - The mode indicator (`SidebarHeader.jsx:30-37`) moves into the PaneLegend status (3.3).
  - The search row (:95-118) becomes a `.ins-well` with a `Keycap('/')` replacing the `Search` icon. Clear stays as the `×` text button.
  - Filter buttons (Markdown, Git, Sync, Star): convert to text toggles `md`, `git` and `sync`, with `data-lit` when active. The star/bookmark stays as a dropdown trigger `[★]`. This removes 5 lucide icons from chrome.
  - `SidebarFileSelection` "Context" block (`file-groups/SidebarFileSelection.jsx:84-102`): label becomes `.ins-legend`; count `tube` uses tabular numerals.
- [x] **6.2 File rows** (`index.css:456-468`, `useRowCursor.js`). The kit's row states map like this:
  - hover: `color-mix(fg 5%, transparent)`
  - **cursor** (`[data-cursor]`): `color-mix(fg 8%, transparent)` plus a lamp-coloured `›` marker via `::before` on the name cell. Not inverse video any more.
  - **selected for context** (`FileNode.jsx:46` `bg-primary/15`): becomes inverse video. Inverse is now reserved for "this is in the prompt", which is rarer and more important.
  - git `M` and counts use `--ins-warn`; tree guides keep `--font-glyph` using `--ins-edge-strong`.
- [x] **6.3 TextareaPanel / TextareaArea**:
  - Toolbar labels "Project" and "Prompt" (`TextareaPanel.jsx:337,339`): `engraved-label` becomes `.ins-legend` at 10px.
  - Input row (`TextareaArea.jsx:41-63`) wrapped in `.ins-well`, padding `8px 10px`.
  - The `❯` glyph and `.tui-caret` use `--ins-lamp`.
  - **Keep your icon send/clear buttons.** Replace the trailing dim `^↵` / `^⇧L` spans with `<KeyChord keys={['^','↵']}/>`, scaled to 14px caps inside buttons.
  - Disabled send keeps your `disabled:text-muted-foreground` treatment.
  - `PaneInfo` (:378-381) keeps TokenUsageDisplay in the bottom border. That's a good spot.
  - Optional: remove the unused `footerInfo` and `isWide` props (TextareaArea ignores them).
- [x] **6.4 Token readouts** (`TokenUsageDisplay.jsx`, `TokenCostEstimate.jsx`, `PromptPreview.jsx`):
  - Keep the `tube*` class names. Retheme: `.tube` = lamp colour, `.tube-idle` = muted, `.tube-overflow` = fault.
  - `engraved-label` becomes an alias of `.ins-legend` at 10px. Redefine the class instead of renaming 11 call sites.
- [x] **6.5 RightSidebar** (`features/agent-jobs/RightSidebar.jsx`):
  - TabButton (:614-632): `bg-primary` fill becomes legend text with `data-lit` lamp colour, plus the count.
  - JobCard (:639-909):
    - The status dot (:680-681, pulsing `rounded-full`) becomes `<Lamp state={JOB_LAMP[status]} blink={running}/>`.
    - The card border (`border-sidebar-border/60`, `rounded-sm`) becomes an `--ins-raised` face plus an `--ins-edge` hairline.
    - Selected = `--ins-edge-strong` frame plus a lit lamp. No primary tint.
    - Meta line: `+a −r` gets a 40px **diff bar** (green and red split, proportional, log-scaled when the total is over 200). This is real data from `diffStat`.
    - The running duration uses tabular numerals in foreground. The `Loader2` spinner is removed because the blinking lamp already says "running".
    - PrimaryAction stays `[label]`. Its `variant==='primary'` (:919) fill becomes an outline with lamp text.
  - RaceGroup (:575-612): `border-primary/30 bg-primary/[0.03]` and the `Swords` icon become a bracket frame with a legend inset into its top border (`RACE · fix resize flicker`), like the mock's grouped controls. Each candidate is a row with a letter, Lamp, duration and diff bar. Compare/Cancel are `[compare]` and `[cancel]`.
  - Collapsed rail (:367-409): vertical `4 JOBS` legend; running count with a lamp.
  - Header icons `PanelRight*`, `Boxes`, `Plus` (chrome): use `[+]` and `[«]`/`[»]` text buttons.
- [x] **6.6 AgentSidebar.jsx** (mounted in RightSidebar, "agents" tab): status dots become `Lamp`; `bg-primary/…` selection (:120) uses the same treatment as JobCard.

**Accept:** compare each pane side by side with board 01. Every state in the job enum renders a distinct lamp. With reduced motion on, nothing blinks.

---

## Phase 7 — Context meter data (Rust + hook)

- [x] **7.1** `src-tauri/src/fs/tokens.rs`: while parsing session lines, keep the **last assistant message's** `usage`. Expose `context_tokens = input + cache_read + cache_creation` of that message on `TokenUsage` (struct at :8-18) as `pub context_tokens: u64`, defaulting to 0.
- [x] **7.2** Add a `#[cfg(test)]` unit test with a 3-line fixture JSONL: last-message selection, and a missing `usage`.
- [x] **7.3** `src/config/pricing.js`, or a new `src/config/models.js`: add a `CONTEXT_WINDOWS` map keyed by model id prefix, with a default. `useTokenUsage` stays as-is. Add a pure helper `getContextFill(tokenUsage) → { used, max, ratio } | null`.
- [x] **7.4** StatusBar meter reads `getContextFill`. The tooltip shows context used/max, session billable and the daily budget (if set), so the existing budget info isn't lost.
- [x] **7.5** Leave `checkBudgetStatus` alone. Note the session-vs-daily mismatch in `docs/specs/token-budget.spec.md` as a known issue. That's a separate fix.

**Accept:**
- Meter moves after each Claude reply, within the 5s poll.
- It drops after `/compact` or `/clear`.
- `cargo test --lib fs::tokens` passes.

---

## Phase 8 — Primitives and dialogs (`src/components/ui/*`)

- [x] **8.1** `button.jsx`** cva:
  - `default` changes from `bg-primary text-primary-foreground` to `bg-transparent text-[var(--ins-lamp)] shadow-[inset_0_0_0_1px_var(--ins-lamp)] hover:bg-[var(--ins-lamp)] hover:text-[var(--ins-panel)]`. Lit outline, filled on hover.
  - The other variants keep inverse-video hover.
  - The `tui-btn` brackets stay.
- [x] **8.2** `dialog.jsx`**:
  - Title (:115): `text-primary font-bold` becomes `.ins-legend` in foreground.
  - Close (:71): `[x]` becomes `<Keycap>esc</Keycap>` as a `<button>`.
  - The footer `esc close` (:75-76) uses `KeyChord`.
  - Frame (`.tui-dialog::after`): `--ins-edge-strong`.
  - Dialog surface becomes `--ins-raised`. The backdrop is `rgb(0 0 0 / .45)`, unchanged if already similar.
  - Fix the duplicated `instant` ternary (:55-56).
- [x] **8.3** `tabs.jsx`, `badge.jsx`, `checkbox.jsx`, `dropdown-menu.jsx`, `toggle.jsx`:
  - Active tab trigger: legend in lamp colour plus a 2px underline.
  - Badge default: outline.
  - Checkbox checked: lamp fill.
  - Dropdown focus item: `color-mix(fg 10%)` plus foreground text, not a primary fill.
  - Separators: `--ins-edge`.
- [x] **8.4** `input.jsx` / `textarea.jsx`**: `.ins-well` instead of `edge-engraved`; focus = 1px lamp outline.
- [x] **8.5 Primary audit.** Go through the ~60 `bg-primary` / `text-primary` / `border-primary` sites from the inventory:
  - "Lit / live / focused" → `--ins-lamp`.
  - "Selected row" (`bg-primary/15` in pickers, palettes, AtMention) → `color-mix(fg 8%)` plus a lamp `›` marker, to match file rows.
  - "Link / accent text" → keep `text-primary`. The theme's own accent stays for links.
  - `border-l-2 border-primary` selected markers (`WorkspaceProjectPicker.jsx:44`, `SecondaryTerminalPicker.jsx:45`, `CliSelectionModal.jsx:33`) → lamp `›` marker, the same idiom everywhere.
- [x] **8.6** Remove the invalid `edge-engraved/50` and `/30` modifiers (`HistoricalBrowser.jsx:109,124`, `ProjectComparison.jsx:102`). Use `edge-engraved` with `opacity-50` on the element, or drop them.

**Accept:**
- `rg "bg-primary" src` returns only intentional sites, each listed in DESIGN.md.
- Every dialog opens with a legend title and an esc keycap.

---

## Phase 9 — Theme pass and verification

- [x] **9.1** `scripts/check-contrast.mjs`, written in the same style as `check-design.mjs` (node, no deps). For each of the 17 themes, compute the derived tokens (re-implement `color-mix` srgb in JS) and assert:
  - foreground on panel ≥ 7:1
  - muted foreground on panel ≥ 4.5:1 (adjust `ui.mutedForeground` per theme if needed)
  - legend on gutter ≥ 4.5:1
  - lamp vs lamp-off distinguishable (ΔL ≥ 25)
  - ok, warn and fault lamps differ in lightness, not hue alone

  Add an `npm run check:contrast` script.
- [x] **9.2** Fix the failing themes via `ui.lamp` / `ui.mutedForeground` overrides in `theme-config.js`.
- [x] **9.3** Light themes (flexoki, catppuccin-latte): verify the glass shade, gutter and lamp glow (reduce glow to `0 0 4px` at 50% alpha on light). Add `[data-theme=light]` rules as needed.
- [ ] **9.4** Repeat the phase 0.3 screenshots in all 5 themes. Compare with the baseline and with board 01.
- [x] **9.5** Keyboard pass:
  - Alt+1–4 lights one legend.
  - j/k cursor shows the `›` marker.
  - `/` focuses the filter well.
  - Every ToggleSwitch is reachable with Tab and toggles with Space.
  - Focus outline is visible everywhere.
- [x] **9.6** Performance:
  - Lamp glow and blink are `box-shadow` plus `opacity` only. Confirm there are no layout thrashes in the Performance panel with 3 running jobs.
  - The meter needle animates only `left` on one element. Fine.

---

## Phase 10 — Docs and cleanup

- [x] **10.1** Write `DESIGN.md` at the repo root. The brief at `index.html:30` requires one. It covers:
  - the thesis and the material rules (flat chrome, one glass, lamps only for live state, keycaps for keys, meters only for quantities with a ceiling);
  - the token table (`--ins-*`);
  - the primitive APIs (Keycap, KeyChord, Lamp, Meter, ToggleSwitch, PaneLegend);
  - the icon policy (D5);
  - the remaining intentional `bg-primary` sites.
- [x] **10.2** Update the `index.html:15-31` thesis comment to the Instrument TUI wording, replacing "Nixie laboratory counter". Update `index.css` header comments.
- [x] **10.3** Update `.patterns/styling.md`:
  - Remove `border-sketch`.
  - Add rules: use `Keycap` for any key hint, `Lamp` for any binary or live state, `Meter` only for value-with-ceiling, `.ins-well` for inputs, no lucide in chrome rows.
  - Add example files.
- [x] **10.4** Update `docs/specs/theming.spec.md`:
  - New derived vars, the `ui.lamp` key and ANSI-derived status colours.
  - The fallback-to-default fix.
  - Bump "Last verified".
- [x] **10.5** Update `docs/specs/token-budget.spec.md` (context_tokens, meter, known session-vs-daily issue) and `terminal.spec.md` (glass wrapper, Glass preference).
- [x] **10.6** Remove the `?kit` dev route, or document it in DESIGN.md if kept.
- [ ] **10.7** Optional cleanup: delete or mount the never-imported `ThemeSwitcher.jsx`, `TypeCheckBadge.jsx` and `AgentOverlay.jsx`; delete the vestigial `tailwind.config.js` (ignored by v4). Ask first.

---

## Suggested commit sequence

1. `chore: commit prompt-action WIP` (phase 0)
2. `feat(theme): instrument material tokens, ANSI-derived status colours` (1)
3. `feat(ui): Keycap, Lamp, Meter, ToggleSwitch, PaneLegend primitives` (2)
4. `feat(layout): gutter + pane legends` (3)
5. `feat(terminal): glass screen` (4)
6. `feat(chrome): title, tabs, status bar, key bar` (5)
7. `feat(panes): files, prompt, jobs on instrument primitives` (6)
8. `feat(tokens): context_tokens + status meter` (7), including the Rust test
9. `refactor(ui): primitives + dialogs off primary` (8)
10. `chore(theme): contrast script + per-theme lamp overrides` (9)
11. `docs: DESIGN.md, styling patterns, specs` (10)

Phases 1–3 are the foundation. Phases 4, 5, 6 and 8 can go in any order after them. Phase 7 is independent and can land first.

## Risks

| Risk | Mitigation |
|---|---|
| WebGL canvas edge shows a 1px seam inside rounded glass | Glass padding ≥ 10px, so the canvas never reaches the radius. The Glass-off preference (4.6) is the fallback. |
| The `*` border-colour base rule recolours new primitives | Primitives set `border-color` explicitly; `.ins-cap` uses a class selector, which beats `*` in the same layer. |
| 17 themes × derived tokens give a bad combination somewhere | The 9.1 script fails CI-style before visual review; per-theme overrides in `theme-config.js`. |
| Users miss the solid blue focus frame | The lit legend plus `--ins-edge-strong` frame is the replacement. If it's too quiet, add a 1px lamp line on the frame's top edge only. |
| Context window per model drifts | `CONTEXT_WINDOWS` is one map with a default. The meter hides when the model is unknown *and* no budget is set. |
