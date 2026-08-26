---
target: the main window shell
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-26T09-52-33Z
slug: src-features-tabs-projecttab-jsx
---
Method: dual-agent (A: design review, isolated · B: detector + static evidence, isolated). Neither saw the other's output before synthesis.

Target: `src/features/tabs/ProjectTab.jsx` and everything it composes · Mode: Operate · Browser inspection: unavailable (no automation tool exposed; Tauri app with a dynamically-allocated Vite port). No overlay exists, no rendered contrast was measured — every claim below is source-level.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Assembled prompt never rendered; send succeeds or fails with identical UI (`usePromptSender.js:172-189`). 0 `aria-live` regions in the shell. |
| 2 | Match System / Real World | 3 | "REF" for `do-not-modify` not derivable (`FileStateSelector.jsx:65`); UI says "Symbols" where product says "Full". |
| 3 | User Control and Freedom | 2 | Send irreversibly clears template + patterns + compaction (`usePromptSender.js:196-215`); `discardJob` destroys a worktree on one click (`RightSidebar.jsx:344`). |
| 4 | Consistency and Standards | 2 | 39 raw `<button>` vs 38 `<Button>` (1.03:1). `ActionButtons.jsx:14-49` duplicates `TokenUsageDisplay.jsx:7-45` verbatim, dead. Four import spellings for Button. |
| 5 | Error Prevention | 2 | Sandbox/network confirm (`StatusBar.jsx:456-470`); money-spending send has no gate; `budgetExhausted` disables Send with no reason (`TextareaPanel.jsx:87,195`). |
| 6 | Recognition Rather Than Recall | 1 | Per-file detail state has no label and no control; patterns are a bare count (`PatternsSelector.jsx:35-40`); view mode is an unlabeled Eye/Shield (`SidebarHeader.jsx:30-36`). |
| 7 | Flexibility and Efficiency | 4 | Excellent. Ctrl+1-9, arrow-key file-state cycling inside @-mention, number keys in template menu, 1/2/3 on focused row. |
| 8 | Aesthetic and Minimalist Design | 2 | Distinctive dashed/OCR language drowned in opacity soup; 83 arbitrary text sizes, 75 duplicating tokens; dead CSS at `index.css:207-222`. |
| 9 | Error Recovery | 1 | Send-path failures are `console.error` (`usePromptSender.js:184, 217`) while a working toast system sits unused two files away. |
| 10 | Help and Documentation | 3 | Ctrl+H dialog, shortcut-bearing tooltips, empty states offering the exact undo for the filter that emptied the view. |
| **Total** | | **22/40** | **Below average — real craft in the details, structural failure at the center** |

## Design Specificity Verdict

LLM assessment: the visual language is authored — dashed "engineering sketch" borders (`index.css:186-204`), Typestar OCR app-wide, a redefined 10/11/12/13px scale, 17 themes with terminal and UI palettes defined together. The composition is category-interchangeable: left tree + center terminal + bottom composer + right jobs rail is every IDE-with-a-chat-panel. The positioning claim is not implemented in the interface: `usePromptSender.js:106-219` builds the entire artifact and the only place it is rendered is `console.log` at line 189. The flagship per-file detail state has no UI — `cycleViewMode` written at `SidebarFileSelection.jsx:48-68`, never called; `getViewModeLabel`/`getLineCount` threaded through `LeftSidebar.jsx:58`, never rendered; mode flips silently at 300/800 lines (`useFileSymbols.js:123-125`). "Context you can see and control" is currently context you can count and hope.

Deterministic scan: shell clean, 0 findings, exit 0. One finding in the wider tree — `bounce-easing` at `src/features/compact/CompactProjectButton.jsx:26`, true positive, outside target, and not covered by the `prefers-reduced-motion` block at `index.css:225-235`. No false positives. The detector being clean means nothing here is generic AI slop; the failures are structural and product-specific.

Convergence: A and B independently reached the theme bug from opposite directions. B pinned it — 28 hex literals in the shell live in 3 files, 4 of which are legitimate `var(--color-x, #fallback)` fallbacks. B found three `index.css` hazards markup review cannot reach, plus one hard number A could not produce: 36 of 39 raw buttons carry no focus style — 8% focus-styled — in an app whose binding constraint is keyboard-first.

Visual overlays: none. Injection never attempted, reason above.

## Overall Impression

More genuine craft than the score suggests, concentrated in the wrong place. The agent-jobs rail has a superb apply gate. The composer, where the thesis lives, has a 32px ghost icon that spends money on a payload the user has never seen. Biggest opportunity: the assembled prompt already exists as a string — render it. This is a rendering gap, not a feature gap.

## What's Working

1. The apply gate and its copy (`RightSidebar.jsx:222, 840-853`). Blocks by default, states why in numbers, names the override plainly, lands changes uncommitted.
2. Empty states offering the exact undo for the filter that emptied the view (`file-tree/EmptyState.jsx:14-46`).
3. Keyboard depth assuming competence — arrow-key state cycling from inside the @-mention popup without the caret leaving the textarea (`TextareaPanel.jsx:174-189`).

## Priority Issues

[P0] The assembled context is never visible. Why: this is the entire positioning; the user's workaround is reading the agent's echo in the terminal after sending, handing the product's argument back to the thing it replaced. Fix: extract the builder from `usePromptSender.js:106-170` into a pure `buildPrompt(...)`, render in a collapsible monospace pane above the textarea, section-labeled, click-to-remove per section; hang the token estimate off the same object. Command: /impeccable clarify

[P0] The per-file detail state has no UI and the documented override does not exist. Why: PRODUCT.md says "auto-chosen by file size but always overridable"; it is not overridable from keyboard or mouse. A 305-line file quietly ships signatures instead of its body. Fix: render the mode label per row in `SelectedFileItem.jsx:39-45` as a 3-state control mirroring `FileStateSelector`, wired to the already-written `cycleViewMode`; show line count; add a binding beside 1/2/3. Command: /impeccable clarify

[P1] Theme keying is broken — 14 of 17 themes paint hardcoded Kanagawa colours. Why: `FileStateSelector.jsx:36` and `TemplateSelector.jsx:57` key on `theme.name?.toLowerCase()` (display string) against id keys; only kanagawa/monokai/gruvbox match; `'Emerald Mono'` -> `'emerald mono'` != `'emerald-mono'`; keys `light` and `dracula` match nothing; both light themes fall through to `#76946A`. Separately `index.css:105` sets `border-color: rgba(255,255,255,0.12)` on the universal selector after `@apply border-border`, so every default border is white-12%; scrollbar thumb hardcoded white (`:152,157,168`). On Flexoki Light / Catppuccin Latte the tree has no visible structure. Fix: key off the theme slug; replace the three hex maps with status tokens; `index.css:105` -> `var(--color-border)`; scrollbar -> `color-mix(in srgb, var(--color-foreground) 15%, transparent)`. Command: /impeccable colorize

[P1] Keyboard-first is a stated constraint the code does not honour — 8% of buttons are focus-styled. Why: 36 of 39 raw buttons carry no focus affordance, concentrated in `RightSidebar.jsx` (12/12), `TitleBar.jsx` (3), `AgentSidebar.jsx` (3), `TabBar.jsx` (2). Three bare `outline-none` inputs (`TerminalSearchBar.jsx:97`, `WorkspaceProjectPicker.jsx:43`, `SecondaryTerminalPicker.jsx:44`). Two hand-rolled `fixed inset-0` modals with no `role="dialog"`, no focus trap. Zero `aria-live`. Fix: route raw buttons through `components/ui/button` (ring already at `button.jsx:8`); add `aria-live="polite"` to job status and the status bar transient zone; replace the two overlays with the Radix Dialog already imported elsewhere. Command: /impeccable harden

[P1] Failures on the send path are invisible. Why: `usePromptSender.js:184` and `:217` swallow write failures into `console.error`; success is `console.log` at `:189`. A failed write looks identical to a successful one — textarea clears, files clear, nothing reaches the agent. Fix: wire `useToast` into `usePromptSender`; error-toast both catches; clear state at `:200-215` only after the write resolves. Command: /impeccable harden

## Persona Red Flags

The hour-eight solo driver: cannot tell whether selected files shipped as bodies or skeletons, whether the two patterns on the Puzzle badge are the intended two, or where the template lands relative to their prose. After send, template badge and pattern count vanish (`usePromptSender.js:211-215`); Ctrl+Z restores only prose.

The theme-switcher on Catppuccin Latte: MOD/REF/EX control paints Kanagawa green/amber on a pale ground; every default border resolves to white-12% and disappears; scrollbar thumb invisible. Cannot see the file tree's structure.

The cost-conscious operator: at 100% budget Send drops to `opacity-50` and says nothing — indistinguishable from "no terminal session". Will restart the session and lose composed context. `onOpenBudgetSettings` exists two components away and is never offered.

The keyboard-only driver: superbly served on authored paths, then the most-marketed capability has no binding because it has no control. The `Alt+Alt` hint at `PromptToolbar.jsx:16` is a non-focusable `<span>`.

The re-orienting driver: default `viewMode` is `'flat'` (`ProjectTab.jsx:122`) and `FlatViewMenu.jsx:34-49` renders inert rows — no checkboxes, selection, git badges or search. The app's default state is the one where its core capability is unavailable. `Shield` means sandboxed at two different scopes (`SidebarHeader.jsx:30`, `StatusBar.jsx:75`).

## Cognitive Load — 6 of 8 failed (critical)

Failed: single focus, chunking, visual hierarchy, one thing at a time, minimal choices, working memory. Passed: grouping (`StatusBar.jsx:347-367`) and progressive disclosure (selectors return null when irrelevant).

Decision points over 4 options: composer toolbar 6 unlabeled icons (`TextareaPanel.jsx:313-327`, incl. a decorative Pencil that does nothing) · composer footer 5 · status bar 9 · settings dropdown 10 items + 2 submenus · sidebar header 5 · JobCard 8. Composer + status bar = ~20 controls in view at compose time, none showing what is about to be sent.

Density is correct for this product and is not the problem. Flatness is.

## Minor Observations

`ActionButtons.jsx` dead, duplicates `TokenUsageDisplay.jsx:17-45` · Pencil at `TextareaPanel.jsx:315-321` labelled "Compose", no behaviour · `TabBar.jsx:29-40` nests onClick `<span>` inside `<button>`, close target keyboard-unreachable · 83 arbitrary text sizes, 75 duplicating tokens, 5 sites below 10px (to ~7.2px) · 26 one-off spacing values, 23 used once · `h-[18px]` click rows (`FileNode.jsx:45`, `FolderNode.jsx:20`) · `border-t/b/e-sketch` mix to 40% while `.border-sketch` does not · `prefers-reduced-motion` misses `animate-spin`, `animate-in/out`, `animate-bounce`, bracketed `transition-[…]` · 4 dead `dark:` variants (nothing adds `.dark`) · dead commented focus CSS at `index.css:207-222`.

## Questions to Consider

1. If the assembled prompt were the largest object on screen and the terminal peripheral, would this product be better or worse?
2. Why does the agent's output get a type-checked apply gate with an explicit "Apply anyway", while the user's prompt — which costs money and cannot be recalled — gets an unlabeled 32px icon?
3. `cycleViewMode` was written and never wired. Cut deliberately, or lost?
4. Flat view cannot select files. If tree view is where the product works, why is `'flat'` the default?
