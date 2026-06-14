# Plan: Companion long-term development roadmap

## Context

The companion app works and is feature-rich, but it has grown to a point where the
*right* next investments are structural, not feature-driven. Two facts drive this plan:

1. **The product *is* the prompt output.** `lookup.js`'s system prompts are the entire
   value of the app, yet there are zero tests on them. Every prompt edit ships on faith;
   a careless change could silently drop furigana, collapse register variation, or break
   the JSON contract, and a N4→N3 learner can't always self-judge the regression.
2. **Complexity is concentrating in `public/index.html`.** Nearly every recent bug in the
   changelog (J-J race, pill desync, furigana scoping, TTS) lives in that one monolithic
   file. The pure backend core is healthy; the frontend is where the pain is.

The user has decided the direction: extract a **shared package** eventually (monorepo with
東京奇譚), evolve the frontend to **ES modules with no build step**, and prioritize a
**prompt-output eval harness + frontend modularization + dev-tooling/discipline hooks**.
New learning features (VS Code ext, pitch dictionary, grammar→Anki) are explicitly deferred.

## Guiding principles (keep these as the north star)

- **`lookup.js` stays pure** — zero deps on Express/DOM/CLI. This is the best decision in
  the repo and is what makes every new surface cheap. Never violate it.
- **Build for problems you have, not ones you might.** Small repo, solo dev — no heavy
  sub-agent orchestration. The push skill + the two hooks already cover mechanical toil.
- **Modularize with extraction in mind.** When splitting the frontend (Phase 2), separate
  genuinely app-agnostic modules (furigana, TTS, visual palette, Anki client) cleanly so
  they lift into the shared package (Phase 4) without a rewrite.

---

## Phase 1 — Prompt-output eval harness (highest priority, do first)

Guards the core. Independent of everything else. Imports `lookup.js` directly (pure core).

**New files (new `eval/` directory):**

- `eval/golden.js` — ~15–20 test cases as `{ input, mode }`, targeting the user's
  documented gaps: abstract grammar uses (ところ・よう・もの・こと), the 見る/見える/見せる
  family, ～てしまう and other N3 patterns, plus a few plain N4 vocab as a baseline.
- `eval/checks.js` — deterministic validators, pure functions `(result) → {pass, messages}`:
  - `everyKanjiHasRuby(result)` — **the #1 invariant.** Walk every Japanese string field
    (core_meaning, sentences[].jp, dont_use, confused_with.*, real_meaning, formation.*,
    bunpro_tip, etc.); flag any CJK ideograph not enclosed in `<ruby>…</ruby>`.
  - `matchesContract(result)` — required fields present per mode, matching the Output
    contracts in CLAUDE.md (vocab vs grammar shapes).
  - `distinctRegisters(result)` — sentence `register` values are varied, not duplicated.
  - `confusedWithPopulated(result)` and `sentenceCount(result)` (vocab ~5, grammar ~4).
- `eval/snapshots/*.json` — saved full outputs, one per golden case.
- `eval/run.js` — orchestrator with three npm scripts (add to `package.json`):
  - `npm run eval` — hit the API for the golden set, run checks, print a pass/fail table,
    exit nonzero on failure. (Costs API calls; slow.)
  - `npm run eval:check` — run checks against existing `eval/snapshots/*.json`. **Free,
    fast, no API.** This is the everyday guard and the CI-friendly gate.
  - `npm run eval:update` — refresh snapshots from the API (run intentionally after a
    prompt change you believe is good; review the diff before committing).

**Why the split:** the furigana/contract checks are deterministic, so they run for free
against snapshots. You only spend API calls when you deliberately refresh. Workflow becomes:
edit prompt → `eval:update` → eyeball the snapshot diff → `eval:check` stays green.

**Verification:** `npm run eval:check` passes on committed snapshots; deliberately break a
snapshot (strip a `<ruby>`) and confirm `everyKanjiHasRuby` fails with a useful message.

---

## Phase 2 — Frontend modularization (ES modules, no build step)

Break `public/index.html`'s inline `<script>` into native ES modules loaded via
`<script type="module" src="js/main.js">`. No bundler — Express already serves `public/`
statically with correct MIME types, so `public/js/*.js` works as-is over localhost.

**Target split (`public/js/`), by responsibility:**

- `state.js` — module state (jjMode, history, currentResult, lookupAbortController, font
  scale, toggle flags) + localStorage helpers (`companion_history_v1`, `companion_jj_v1`).
- `render.js` — `renderVocab`, `renderGrammar`, `renderResult`, `renderError`,
  `parsePartial`, `partialFieldCount`, pitch-contour rendering.
- `lookup-client.js` — `doLookup` (with the AbortController/jjSnapshot logic), the SSE
  stream consumer, and the 読む paste-mode stream consumer.
- `anki.js` — `checkAnkiCard`, → Anki two-click confirm, send/enrich handlers, 苦手 panel.
- `bunpro.js` — `checkBunproStatus`, 文法苦手 panel.
- `history.js` — `addToHistory`, `filterHistory`, history panel UI.
- `tts.js`, `furigana.js` — **shared-package candidates** (Phase 4): TTS voice selection +
  pause/resume; furigana toggle + WanaKana IME binding. Keep these app-agnostic.
- `main.js` — imports the above, wires event listeners, runs init.

**Approach (this file is the most bug-prone — be careful):**
- Extract **one module at a time**, re-launching and driving the app after each extraction
  (use the `run` skill: real browser, exercise lookup + stream + toggle + Anki + history).
  The PreToolUse hook auto-archives `index.html` before the first edit of the day.
- The CSS/visual palette can stay in `index.html` for now, or move to `public/css/` — but
  keep the 東京奇譚-shared palette tokens isolated so they lift cleanly in Phase 4.

**Verification:** after each extraction the app loads with no console errors and the
touched feature still works end-to-end; full smoke (vocab lookup, grammar lookup, J-J
toggle mid-stream, 読む paste, → Anki, history re-render) passes once at the end.

---

## Phase 3 — Dev tooling & discipline hooks (small, alongside Phases 1–2)

- **`/lookup-eval` skill** (`.claude/skills/lookup-eval/SKILL.md`) — runs `eval:check`,
  interprets failures, and (on request) `eval:update` + summarizes the snapshot diff.
  Turns the harness into a one-word command and lets the agent suggest prompt fixes.
- **Prompt-edit nudge** — extend the existing PostToolUse hook in `settings.local.json`:
  when the edited file is `src/lookup.js`, print `→ prompt changed; run npm run eval:check
  before shipping.` Cheap nudge that closes the loop with Phase 1.
- **Changelog-nag Stop hook** — on Stop, if the newest mtime among `src/**` and
  `public/**` is newer than `CLAUDE.md`'s mtime, print a reminder that the changelog needs
  an entry. **Must be git-independent** (this working copy currently reports as not a git
  repo — mtime comparison avoids relying on `git status`).
- **Refresh-reminder coverage** — widen the existing static-file reminder hook from only
  `public/index.html` to any `public/**/*.{html,js,css}` so the new `js/` modules also
  trigger the "Cmd+Shift+R" reminder.
- **Optional `.env` staging guard** — a PreToolUse hook on `Bash` that hard-blocks
  `git add` of `.env`, as belt-and-suspenders over the push skill's existing rule.

---

## Phase 4 — Extract shared `jp-ui` package → monorepo (the architectural payoff)

Enabled by Phase 2. Target end-state:

```
monorepo/
  packages/jp-ui/      ← furigana renderer, TTS, visual palette/CSS tokens, Anki client
  apps/companion/      ← imports jp-ui; keeps lookup.js, server.js, its own UI
  apps/tokyo-kitan/    ← imports jp-ui
```

- Lift the app-agnostic modules from Phase 2 (`furigana.js`, `tts.js`, palette CSS, and
  likely `src/anki.js` as a shared client) into `packages/jp-ui`.
- Keep `lookup.js` in the companion app — it's companion-specific and must stay pure.
- Decide the package mechanism then (npm workspaces is the no-build-friendly default).

This is the resume-worthy, learning-rich piece. Do it **after** the frontend is modular —
not before — so extraction is a move, not a rewrite. Detail this phase in its own plan
when Phases 1–3 are done.

---

## Deferred (parked, not in this plan)

VS Code extension on selected text, pitch-accent dictionary (Kanjium) to replace the
AI-generated `pitch_accent`, grammar→Anki cards, BunPro write-back. All remain in the
CLAUDE.md roadmap; revisit after the structural work lands.

---

## Sequencing & bookkeeping

1. Phase 1 (eval harness) — start here, self-contained.
2. Phase 3's prompt-edit nudge + `/lookup-eval` skill — fold in once Phase 1 exists.
3. Phase 2 (modularization) — incremental, verified per step.
4. Phase 3's remaining hooks — alongside Phase 2.
5. Phase 4 — separate plan when 1–3 are done.

Per repo conventions: each significant change gets a CLAUDE.md changelog entry (the new
nag hook enforces this), the PreToolUse hook auto-archives edited files, and this plan
gets copied to `plans/YYYY-MM-DD_*.md` before the next task overwrites it. Also record this
roadmap in the CLAUDE.md **Roadmap** section so it survives outside the plan file.
