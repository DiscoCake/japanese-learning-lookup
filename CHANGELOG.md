# Changelog

Reverse-chronological. Add an entry whenever a feature is added, changed, or removed.
Include the date (YYYY-MM-DD) and a tight bullet list. Note any archived files.

### 2026-06-14 — Retrospective fixes: eval hardening, paste serialization, archive hook, README

- `src/lookup.js`: added ruby reminder to `sentences[N].notes` field in all four system prompts
  (VOCAB_SYSTEM, GRAMMAR_SYSTEM, and their JJ variants); added explicit SENTENCE RULES bullet
  to reinforce ruby on notes — closes the gap that was causing 7/18 eval failures; eval baseline
  now 23/23 (up from 0/23 with new validators)
- `src/lookup.js`: `lookupStream()` now forwards `opts.context` to the user message, matching
  the pattern already in `lookup()` — forward-compat fix for future context-aware streaming
- `src/server.js`: replaced `Promise.all` in `/api/paste/stream` with a serial loop (3s spacing,
  3-retry 429 backoff) — parallel calls with 5–12 words were hitting org output-token/min limit
- `.claude/settings.local.json`: archive hook now covers `public/js/*.js` and `packages/jp-ui/*`
  in addition to `src/*.js` and `public/index.html`; `gh pr create` allow permission broadened
  from hardcoded branch/title to `gh pr create *`
- `eval/checks.js`: `everyKanjiHasRuby` now uses `includeNotes: true` — notes fields were
  previously excluded from the ruby check despite frequently containing Japanese; `matchesContract`
  tightened with `pitch_accent.number` integer check, `pitch_accent.label` allowlist (both English
  Kanjium labels and Japanese AI-generated labels), and `confused_with.reading` presence check
- `eval/golden.js`: 5 new cases added — `よう` (vocab, abstract noun with grammatical uses),
  `所` (vocab, kanji form of ところ to avoid grammar-mode heuristic), `～かもしれない`,
  `～てもいい`, `～たことがある` (N4 grammar gap coverage); total: 18 → 23 cases
- `eval/snapshots/`: all 23 snapshots regenerated and passing with new validators
- `README.md`: updated pitch accent description (Kanjium dictionary, not AI-only); added mode
  override pill feature; added Grammar → Anki feature; added Development section with eval
  harness commands

### 2026-06-14 — Phase 4: shared `jp-ui` package (palette CSS + furigana toggle)

- `packages/jp-ui/palette.css`: shared CSS custom properties (`:root` vars), universal box-sizing
  reset, and base `body { background; color; min-height }` — identical palette from both apps
  extracted into one file; **excludes** `--green`/`--green2` (companion-only) and per-app body
  layout/font (differ between the two)
- `packages/jp-ui/furigana.css`: shared `ruby`, `rt`, and `body.hide-furigana rt` rules;
  companion overrides `rt { font-family }`, tokyo-kitan overrides `rt { font-size; letter-spacing }`
  in their own stylesheets
- `packages/jp-ui/furigana.js`: ES module export `setFurigana(on)` — toggles `hide-furigana`
  class on `<body>`; each app wraps it with app-specific button state and button ID logic
- `src/server.js`: added `app.use('/jp-ui', express.static(...packages/jp-ui))` before the
  public static route so `/jp-ui/*.css` and `/jp-ui/furigana.js` are accessible to the frontend
- `public/js/furigana.js`: imports `setFurigana as setFuriganaCore` from `/jp-ui/furigana.js`;
  companion wrapper adds `furiganaOn` state + `#furigana-btn` toggle; IME helpers unchanged
- `public/index.html`: added `<link>` tags for `palette.css` and `furigana.css` from `/jp-ui`;
  removed `:root` vars (keep `--green`/`--green2`), universal reset, `body { bg/color/min-height }`,
  `body.hide-furigana rt`, `ruby`, and `rt` base rules — all now in jp-ui; kept companion-specific
  body layout (flex, padding), `html { font-size 17px }`, and `rt { font-family }` override
- `tokyo-kitan/server.js`: added `/jp-ui` route pointing to `../companion/packages/jp-ui`
- `tokyo-kitan/public/index.html`: added jp-ui `<link>` tags before `css/style.css`
- `tokyo-kitan/public/css/style.css`: removed duplicated `:root`, `*` reset,
  `body { bg/color/min-height }`, `hide-furigana`, `ruby`, `rt` base — kept `html { 18px }`,
  `body { font-family Hiragino }`, and `rt { 0.52rem; letter-spacing 0.01em }` override
- `tokyo-kitan/public/js/main.js`: imports `setFurigana as setFuriganaCore` from
  `/jp-ui/furigana.js`; local `setFurigana` now calls core instead of `classList.toggle`
  directly; still updates all 3 app-specific buttons (`furigana-btn`, `setup-furigana-btn`,
  `dungeon-furigana-btn`)
- Archived: `archive/2026-06-14_server_pre-phase4.js`, `archive/2026-06-14_index_pre-phase4.html`,
  `archive/2026-06-14_furigana_pre-phase4.js`; tokyo-kitan: `archive/2026-06-14_server_pre-phase4.js`,
  `archive/2026-06-14_index_pre-phase4.html`, `archive/2026-06-14_style_pre-phase4.css`,
  `archive/2026-06-14_main_pre-phase4.js`
- Verified: companion smoke tests 10/10 pass; `/jp-ui/*.css` and `/jp-ui/furigana.js` served
  correctly; furigana toggle check (rt display:none) passes via shared CSS rule

### 2026-06-14 — Kanjium pitch accent dictionary

- `data/kanjium_accents.txt`: Kanjium dictionary data (~124k entries, 3.1 MB); format:
  `word\treading\tpitch_number(s)` — authoritative Tokyo-standard accent; multi-pitch entries
  comma-separated (first listed is canonical)
- `src/pitch.js`: new module — lazy-loads and indexes the data on first call into three maps:
  exact `word\treading`, word-only (first reading), reading-only (last resort); `lookupPitch(word,
  reading)` returns `{ number, label, pattern }` or `null`; mora-grouping logic matches
  render.js exactly (small-kana pairs, っ counts as own mora); silent no-op if file missing
- `src/lookup.js`: `require('./pitch')` added; both `lookup()` and `lookupStream()` call
  `lookupPitch(result.word, result.reading)` after parsing and override `result.pitch_accent`
  when the dictionary has a match — AI-generated pitch kept only for words not in Kanjium
- Verified: unit tests confirm `見る→1`, `食べる→2`, `話す→2`, `日本語→0`, `所(ところ)→0`,
  kana-only `ところ→0`, miss returns null; Playwright confirms `見る` renders `pd(み)pl(る)`
  (atamadaka) and `話す` renders `pl(は)pd(な)pl(す)` (nakadaka) with zero console errors

### 2026-06-14 — Pre-PR smoke test gate + /pre-pr skill

- `test/smoke.js`: 10-check golden-path Playwright suite — zero console errors on load, mode
  pill auto-detects grammar/vocab, 見る lookup returns ≥3 cards and speak buttons, furigana
  toggle (checks `rt` display, not `ruby`), history badge increments, mode override shows ✎ +
  manual class, typing resets override; exits 0 on pass, 1 on fail; falls back to npx cache
  path if `playwright` devDep not installed
- `package.json`: added `"test:smoke": "node test/smoke.js"` script
- `.claude/settings.local.json`: added second Bash PreToolUse hook — fires on any `gh pr create`
  command; checks if server is running (curl localhost:3001); if up, runs smoke tests and blocks
  (exit 2) on failure; if server is down, warns and allows (non-blocking)
- `.claude/skills/pre-pr/SKILL.md`: new `/pre-pr` skill — read the diff, run smoke tests first,
  derive targeted Playwright checks for changed surfaces, stamp PR test plan with ✅/⚠️
  (⚠️ only for genuinely untestable headlessly: Anki desktop, live BunPro token)

### 2026-06-14 — Grammar/vocab mode override pill

- `src/lookup.js`: both `lookup(input, opts)` and `lookupStream(input, opts)` now respect
  `opts.forceMode` (`'vocab'` | `'grammar'` | falsy); when set, skips `detectMode()` and
  uses the forced mode directly
- `src/server.js`: `/api/lookup` and `/api/lookup/stream` routes now destructure and forward
  `forceMode` from the request body to `lookup()` / `lookupStream()`
- `public/js/lookup-client.js`: added module-private `modeOverride = null` state;
  `getModeOverride()` / `setModeOverride(mode)` / `clearModeOverride()` exports;
  `doLookup()` sends `forceMode: modeOverride || undefined` in the fetch body
- `public/js/main.js`: `updateModePill(mode, manual)` helper — renders `文法`/`単語` +
  optional ` ✎` suffix, sets `mode-pill grammar|vocab` class + `manual` class when overridden;
  `input` event calls `clearModeOverride()` then `updateModePill(detectMode(v), false)`;
  `#mode-indicator` click handler toggles override between `'vocab'` and `'grammar'` via
  `setModeOverride` then re-calls `updateModePill(next, true)`; programmatic lookups from
  苦手 panel and 文法苦手 panel both call `clearModeOverride()` first (`.value =` doesn't fire
  `input`, so auto-clear wouldn't trigger)
- `public/index.html`: CSS for `#mode-indicator { cursor: pointer; user-select: none; }`,
  `#mode-indicator:hover { opacity: 0.75; }`, `.mode-pill.manual { border-style: dashed; }`
- Verified (Playwright): ところ auto-detects 文法; click flips to 単語 ✎ + dashed border;
  click again flips to 文法 ✎; typing a new char resets to 単語 (no ✎, solid border);
  見る auto-detects 単語; click flips to 文法 ✎; zero console errors

### 2026-06-14 — Grammar → Anki cards

- `src/anki.js`: added `ensureGrammarModel()` — creates a "Companion Grammar" note type on
  first use (env var `ANKI_GRAMMAR_MODEL`; defaults to `'Companion Grammar'`); fields:
  Pattern, Meaning, Formation, Common Mistake, Sentence, Sentence Furigana, Sentence Meaning,
  Notes; front shows Pattern + Sentence; back shows Pattern → Meaning → Formation →
  ⚠️ Common Mistake → Sentence Furigana → Translation → TTS → Notes (bunpro_tip);
  CSS: purple (#b97fff) for the pattern, matching the app's grammar color
- `src/anki.js`: added `addNoteForGrammar(result, sentence)` — populates all fields from
  the lookup result (real_meaning, formation.rule, formation.common_mistake, bunpro_tip);
  tags: `['companion', 'grammar']`; duplicate check scoped to deck
- `src/anki.js`: exported `addNoteForGrammar`
- `src/server.js`: added `POST /api/anki/grammar/create { result, sentence }` route
- `public/js/render.js`: added `→ Anki` button to grammar sentences (when not compact);
  unlike vocab buttons these start visible — no `checkAnkiCard` gating for grammar
- `public/js/anki.js`: `initAnkiResultHandlers` send handler now checks
  `currentResult.mode === 'grammar'` first and calls `/api/anki/grammar/create`; vocab
  paths (enrich / update / create) unchanged

### 2026-06-14 — Phase 3 dev tooling: changelog nag + .env staging guard

- `.claude/settings.local.json`: two new hooks added:
  - **Stop / changelog nag**: at end of each turn, checks if any `src/*.js` or
    `public/js/*.js` has an mtime more than 5s newer than `CLAUDE.md`; if so, prints a
    reminder and exits 2 so Claude must acknowledge before the turn closes. Git-independent
    (mtime-based so it fires before a commit is ever made).
  - **PreToolUse / Bash / .env staging guard**: intercepts any `git add` command that
    includes `.env` as a standalone argument; exits 2 with a clear refusal message.
    Regex excludes `.env.example` and other prefixed variants — only the bare `.env` file
    is blocked.

### 2026-06-14 — Phase 2 frontend modularisation: main.js (step 7 — final)

- `public/js/main.js`: extracted the last 122 inline lines — all event wiring and app init;
  imports use sibling-relative paths (`./furigana.js`, `./render.js`, etc.) since the file
  lives alongside the other modules in `public/js/`
- `public/index.html`: inline `<script type="module">…</script>` replaced with
  `<script type="module" src="./js/main.js"></script>`; file is now 411 lines — pure HTML +
  CSS, zero JS. **Phase 2 complete.**
- Module graph (`main.js` → all others): main → lookup-client → render/anki/bunpro/history/tts;
  main → history/anki/bunpro/furigana/render (direct); no cycles
- Verified: page load zero errors, 7 cards on 見る lookup, 5 speak buttons, history badge,
  J-J toggle, paste mode switch, history panel open/close — all intact

### 2026-06-14 — Phase 2 frontend modularisation: lookup-client.js (step 6)

- `public/js/lookup-client.js`: new ES module extracting the last major inline block —
  ~240 lines moved out of `<script>`:
  - Module-private state: `jjMode` (init from localStorage), `currentResult`,
    `lookupAbortController`, `currentPasteResults`
  - `getJJMode()` / `setJJModeState(on)` — getters/setters for the inline `setJJ` wrapper
  - `getCurrentResult()` — getter for `initAnkiResultHandlers` and `setJJ`
  - `renderResult(r)` — sets `currentResult = r` then renders + fires `checkAnkiCard` /
    `checkBunproStatus`; consolidates what was two separate assignments in the old inline code
  - `doLookup()` — SSE stream consumer with AbortController; reads `#search-input` from
    DOM directly (no searchInput ref needs passing in)
  - `setAppMode(mode)` — 調べる/読む tab switching; resets `currentPasteResults` on exit
  - `doPaste()` — paste mode SSE stream consumer
  - `initPasteResultHandlers()` — registers `#paste-results` delegated click handler
    (speak + bulk TSV); kept in module because it closes over `currentPasteResults`
  - Imports: `tts.js`, `render.js`, `anki.js`, `bunpro.js`, `history.js` — DAG; no cycles
- `public/index.html`: inline `<script>` 357 → 122 lines; total file 768 → 531 lines

### 2026-06-14 — Phase 2 frontend modularisation: bunpro.js (step 5)

- `public/js/bunpro.js`: extracted `checkBunproStatus`, `openBunproPanel(onPatternClick)`,
  and private helpers `srsClass`, `srsLabel`, `formatNextReview`; zero imports
- `openBunproPanel` hides the panel internally before calling `onPatternClick(pat)` —
  same callback pattern as history and anki panels
- Verified: grammar lookup (6 cards, BunPro section in DOM), 文法苦手 hidden without token,
  vocab (7 cards), history + Anki panels unaffected — zero JS errors

### 2026-06-14 — Phase 2 frontend modularisation: anki.js (step 4)

- `public/js/anki.js`: extracted all frontend Anki logic — module-private `currentAnkiNote`,
  `pendingAnkiBtn`, `pendingTimer`; imports `speak` from `tts.js` and `toAnkiTSV` from
  `render.js` directly (no circular deps)
- Exports: `checkAnkiCard(result)`, `openAnkiPanel(onWordClick)`, `initAnkiResultHandlers(...)`
- Verified: 7 cards/5 speak/5 Anki buttons, TSV+JSON copy buttons, 苦手 panel loads live
  cards, closes correctly — zero JS errors

### 2026-06-14 — Phase 2 frontend modularisation: history.js (step 3)

- `public/js/history.js`: extracted history state; exports `addToHistory`, `findInHistory`,
  `clearHistory`, `updateHistoryBadge`, `openHistoryPanel(onSelect)`
- `openHistoryPanel` takes an `onSelect(r)` callback — keeps `renderResult` and
  `currentResult` out of the history module (no circular dep)
- Verified: badge updates, panel opens/closes, entry click re-renders, search filter works

### 2026-06-14 — Phase 2 frontend modularisation: render.js (step 2)

- `public/js/render.js`: extracted all pure HTML-string generators — `parsePartial`,
  `detectMode`, `formatPitchDisplay`, `renderVocab`, `renderGrammar`, `exportBar`,
  `renderError`, `toAnkiTSV` (~250 lines); zero imports, zero module-level state

### 2026-06-14 — Phase 2 frontend modularisation: tts.js + furigana.js (step 1)

- `public/js/tts.js`: extracted `speak(text, btn)` + module-private state; exports only `speak`
- `public/js/furigana.js`: extracted furigana toggle + WanaKana IME helpers
- `public/index.html`: `<script>` → `<script type="module">`
- Archived: `archive/2026-06-14_index.html` (auto, via PreToolUse hook before first edit)
- Verified: zero console errors, furigana toggle, 見る lookup (7 cards, 5 speak, 5 Anki btns)

### 2026-06-14 — Prompt-output eval harness (roadmap Phase 1) + truncation fix

- `eval/` directory: `golden.js` (~18 cases), `checks.js` (deterministic validators),
  `run.js` (check/update/run modes), `snapshots/*.json` (18 baseline outputs)
- `package.json`: added `eval`, `eval:check`, `eval:update` scripts
- `src/lookup.js`: `max_tokens` 3000 → 5000 — harness surfaced truncation on multi-sense
  entries (～そうだ) causing hard JSON.parse crashes
- `.claude/skills/lookup-eval/SKILL.md`: new `/lookup-eval` skill
- Archived: `archive/2026-06-14_lookup.js`
- **Known baseline**: 7/18 snapshots fail `kanji-ruby` — model intermittently drops ruby on
  common kanji. Honest red baseline; prompt-tuning follow-up.

### 2026-06-14 — J-J mode abort + race-condition fix

- `doLookup()` aborts in-flight stream via AbortController on new lookup
- `jjMode` snapshotted before first `await` — entire call uses consistent jj value
- `AbortError` silently returns; loading state cleanup guarded by controller identity check
- Archived: `archive/2026-06-14_index_pre-abort-fix.html`

### 2026-06-14 — J-J mode cache fix + 英語/日本語 toggle switch

- `doLookup()` stamps `evt.result.input = input` before `addToHistory` — fixed cache misses,
  history dedup collapse, and J-J toggle using wrong word
- `日日` button replaced with `<div class="lang-switch">` with `英語`/`日本語` pills
- Archived: `archive/2026-06-14_index_pre-jj-cache-fix.html`

### 2026-06-14 — Companion card furigana: raw HTML fields, drop {{furigana:}} filter

- Root cause: Anki's `{{furigana:Field}}` distributes multi-mora readings evenly across kanji
  characters, breaking single-kanji words with 2+ mora readings (`本[ほん]`, `人[ひと]`)
- `src/anki.js`: `Word Furigana` and `Sentence Furigana` now store raw `<ruby>` HTML;
  `rubyToAnkiFurigana()` removed; back template uses `{{Word Furigana}}` not `{{furigana:…}}`
- Sentinel bumped `companion-v2` → `companion-v3`; auto-upgrade on next use
- Archived: `archive/2026-06-14_anki_pre-furigana-fix.js`

### 2026-06-14 — Anki update completeness, new card creation fix, history UX

- `addNoteForWord` calls `createDeck` before `addNote` — AnkiConnect doesn't auto-create decks
- `updateCardSentence` / `enrichAndUpdateCard` extended to write `Sentence Highlighted` +
  `Sentence Furigana` when those fields exist on the note type
- History panel: per-item delete button (✕) added; bulk TSV export removed (unused)
- Archived: `archive/2026-06-14_server_pre-update-fields.js`

### 2026-06-14 — UX polish + furigana consistency + 日日 live-switch

- TTS bug fix: `setTimeout(doSpeak, 50)` flushes Chrome/macOS cancel before new utterance
- TTS voice randomization: picks randomly from Enhanced/Premium voices per utterance
- Panel UX: 閉じる/更新 moved to top of sliding panels
- History re-sort on click; furigana CSS extended to `#paste-results ruby`
- 日日 live-switch: `setJJ(on)` calls `doLookup()` when `currentResult` set

### 2026-06-14 — Kaishi 1.5k card layout for Companion note type

- `src/anki.js`: `formatPitchHtml`, `highlightWordInSentence` added; Companion card layout
  matches Kaishi 1.5k sizes (44/24/25/20px); new fields: Word Furigana, Pitch, Sentence
  Highlighted, Sentence Furigana; auto-upgrade via `<!-- companion-v2 -->` sentinel
- Archived: `archive/2026-06-14_anki_pre-kaishi-template.js`

### 2026-06-14 — J-J mode (日日モード)

- `src/lookup.js`: `VOCAB_SYSTEM_JJ` + `GRAMMAR_SYSTEM_JJ` — prose in JLPT N4–N5 Japanese
- History cache keyed on `{input, jj}` so J-J and J-E results coexist
- Archived: `archive/2026-06-14_lookup_pre-jj.js`, `archive/2026-06-14_server_pre-jj.js`,
  `archive/2026-06-14_index_pre-jj.html`

### 2026-06-13 — Pitch accent display + context-aware 読む mode

- `lookup(input, opts)` accepts `opts.context` — appends source sentence to user message
- `VOCAB_SYSTEM` gains `pitch_accent` schema field (AI-generated; Kanjium dictionary on roadmap)
- `/api/paste/stream` passes each word's source sentence as context to `lookup()`
- Archived: `archive/2026-06-13_lookup_pre-pitch-context.js`, etc.

### 2026-06-13 — BunPro integration: grammar SRS status + 文法苦手 panel

- `src/bunpro.js`: new module; `getGrammarStatus`, `getTroubledGrammar`; silent when key absent
- Routes: `GET /api/bunpro/grammar`, `GET /api/bunpro/troubled`
- Frontend: BunPro status card after grammar lookups; 文法苦手 sliding panel
- Archived: `archive/2026-06-13_index_pre-bunpro.html`, `archive/2026-06-13_server_pre-bunpro.js`

### 2026-06-13 — 読む mode (JRPG paste mode)

- `identifyWords(text)` — identifies 5–12 N3-range words in a paragraph; exported
- `POST /api/paste/stream` — SSE: sends `identified` words then streams each `result`
- Frontend: 読む/調べる tab toggle; paste panel; placeholder cards filled in-place
- Archived: `archive/2026-06-13_lookup_pre-paste.js`, `archive/2026-06-13_index_pre-paste.html`

### 2026-06-13 — Anki: deck name display, TTS ordering, duplicate TTS fix, premium voices

- `findNoteForWord` returns `deckName` via `cardsInfo`; shown as badge in Ankiカード section
- `patchModelWithSentenceSection` injects Reading TTS before Sentence TTS (Kaishi order)
- `patchModelForTTS` delegates to `patchModelWithSentenceSection` to avoid duplicate tags
- `buildTtsTag(fieldKey)` / `upgradeModelTTSTag` — single source of truth for TTS tag construction
- `→ Anki` buttons require two clicks — 確定? state, 3s auto-cancel, outside-click cancel
- Archived: `archive/2026-06-13_anki.js`, `archive/2026-06-13_index.html` (multiple snapshots)

### 2026-06-13 — Enrich non-standard cards in place (preserve review history)

- `enrichNoteType` / `enrichAndUpdateCard` / `patchModelWithSentenceSection` added to `src/anki.js`
- `POST /api/anki/card/enrich` route; `needsMigration` flag drives enrich vs update path

### 2026-06-13 — Auto-detect sentence field from card template; remove field picker

- `extractTemplateFields` / `detectBackField` added — auto-detects back-only fields
- Field picker `<select>` removed from frontend

### 2026-06-13 — Replace VoiceVox with Anki built-in TTS

- `ensureCompanionModel()` creates Companion note type with `{{tts ja_JP:Sentence}}`
- `patchModelForTTS()` appends conditional TTS to any note type's back template
- VoiceVox removed; `generateSentenceAudio` / `storeAudioAndGetTag` deleted
- Archived: `archive/2026-06-13_anki.js`

### 2026-06-13 — Anki card sentence viewer + replacer + card creator

- `src/anki.js` created: `findNoteForWord`, `updateCardSentence`, `addNoteForWord`, etc.
- 4 new routes in `src/server.js`; `checkAnkiCard()` fires after every vocab result

### 2026-06-13 — TTS furigana fix + pause/resume

- `speak(text, btn)` — same button toggles pause/resume; furigana stripped before TTS
- ▶ shows ⏸ while playing; `utt.onend` resets to ▶

### 2026-06-12 — Streaming, coloring, history cache, 苦手 panel

- `lookupStream()` async generator + `POST /api/lookup/stream` SSE route
- Progressive render: brace-tracker parses chunks as they arrive
- History doubles as lookup cache; sentence kanji cyan, kana near-white
- `src/anki.js`: AnkiConnect struggling-cards panel (`lapses >= 2`)
- `GET /api/anki/struggling` route; 苦手 button + sliding panel in frontend
- Deck filter pills; font size scaler (−/100%/+, Ctrl+scroll)
- `max_tokens` 1400 → 3000; `output_config: { effort: 'medium' }`
- Furigana consistency fixes; model ID corrected to `claude-sonnet-4-6`

### 2026-06-12 — initial documented state

- Web app + CLI with full vocab and grammar modes
- WanaKana IME, furigana toggle, live mode-pill
- History (50 entries, localStorage), Anki TSV export, JSON copy
