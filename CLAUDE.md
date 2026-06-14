# CLAUDE.md — Japanese Study Companion

Vocab and grammar deep-diver for an N4→N3 Japanese learner.
One word or grammar pattern in → rich contextual breakdown out.
Sibling project to 東京奇譚 (same visual palette, same stack).

## Repository

https://github.com/DiscoCake/japanese-learning-lookup
`git remote`: `git@github.com:DiscoCake/japanese-learning-lookup.git`

## Architecture

```
src/lookup.js     ← ALL prompt logic. No framework code. Returns a plain JS object.
src/server.js     ← Express proxy. POST /api/lookup → lookup() → JSON response.
src/anki.js       ← AnkiConnect client. Sentence management, card enrichment, struggling-card queries.
                     Zero dependencies on lookup.js or the frontend.
src/bunpro.js     ← BunPro API client. Grammar SRS status lookup and troubled-grammar queries.
                     Zero dependencies on lookup.js or the frontend.
src/cli.js        ← CLI. `node src/cli.js 見る` or `node src/cli.js ～てしまう`
public/index.html ← Frontend. Vanilla JS, no build step.
```

The core design rule: `lookup.js` has zero dependencies on Express, the DOM, or the CLI.
It's a pure async function. New surfaces (VS Code extension, hotkey script, Discord bot)
import it directly — they don't touch the other files.

## Design decisions — don't change without asking

1. **Streaming API call per lookup** via `lookupStream()` in `src/lookup.js`. Server
   (`POST /api/lookup/stream`) streams SSE chunks to the browser for progressive card rendering.
   Falls back to non-streaming `lookup()` if the stream fails mid-response. CLI and
   history re-render use the non-streaming path unchanged.

2. **Auto mode detection in lookup.js and frontend.**
   - Starts with ～ or 〜, or contains those characters → grammar mode
   - Pure hiragana 3+ chars → grammar mode
   - Everything else → vocab mode
   The frontend shows a live mode-pill as the user types so they know which mode will fire.

3. **All Japanese output has ruby furigana on every kanji.**
   `<ruby>漢字<rt>かんじ</rt></ruby>` — same rule as 東京奇譚.
   Furigana color: pink (#ff6fa8). Kanji color: teal (#4fd8e8) via `#result ruby { color: var(--cyan) }`.
   In example sentences kana is near-white (`--text`); in prose cards all text is muted (`--text2`).
   When furigana is toggled off, kanji reverts to surrounding text color (`color: inherit`).

4. **WanaKana IME bound by default** (IMEMode: true). Toggle button to disable.
   Same pattern as 東京奇譚 typed input — user types romaji, gets kana.

5. **History in localStorage** (`companion_history_v1`), capped at 50 entries.
   Clicking a history entry re-renders from the cached result — no API re-call.
   "Export all history" TSV for bulk Anki import.

6. **Anki TSV format:** `word/pattern \t reading \t plain-text-sentence \t translation`
   HTML tags stripped from Japanese before export. Same pipeline as 東京奇譚 vocab log.

7. **Visual identity matches 東京奇譚.** Deep indigo bg (#0d0d1a), pink for accents/furigana,
   cyan for main Japanese text, yellow for warnings/mistakes, purple for grammar/contrast.
   Noto Serif JP for Japanese display text, Noto Sans JP for UI.

8. **Anki integration via AnkiConnect** (`src/anki.js`). Requires Anki open with
   AnkiConnect add-on (ankiweb.net/shared/info/2055492159).

   - `findNoteForWord` searches by Word field then falls back to full-text search;
     detects sentence field by name (SENTENCE_KEYS list) or by back-template analysis
     (`detectBackField`). Returns `deckName` via `cardsInfo`.
   - Non-standard note types (any deck) are enriched in-place via `modelFieldAdd` —
     Companion fields (Reading, Meaning, Sentence, etc.) added without touching review history.
   - TTS in Anki card templates via `{{tts ja_JP voices=...:Field}}`. Premium macOS
     voices configured via `ANKI_TTS_VOICES` env var. Enriched cards play the Reading
     field first (word pronunciation) then the Sentence field — mirrors Kaishi 1.5k audio order.
   - `→ Anki` buttons require two clicks (確定? confirm state, 3s auto-cancel) to prevent
     accidental overwrites. Outside-click also cancels.
   - New cards go to the Companion deck using a Companion note type auto-created on
     first use (`ANKI_COMPANION_DECK` / `ANKI_COMPANION_MODEL` env vars).
   - `buildTtsTag(fieldKey)` is the single source of truth for TTS tag construction;
     `upgradeModelTTSTag` upgrades bare `{{tts ja_JP:Field}}` tags to the voices version
     when `ANKI_TTS_VOICES` is set.
   - Struggling cards panel (苦手): `getStrugglingCards` queries cards with `lapses >= 2`,
     displayed in a sliding panel with deck filter pills; click any word to look it up.

## Output contracts

### Vocab mode
```json
{
  "word": "見る",
  "reading": "みる",
  "mode": "vocab",
  "core_meaning": "...",
  "sentences": [
    { "jp": "ruby-annotated", "translation": "...", "register": "casual|standard|formal|written", "notes": "..." }
  ],
  "dont_use": "...",
  "confused_with": { "word": "...", "reading": "...", "contrast": "..." },
  "frequency": "...",
  "anki_hint": "..."
}
```

### Grammar mode
```json
{
  "pattern": "～てしまう",
  "mode": "grammar",
  "real_meaning": "...",
  "formation": { "rule": "...", "common_mistake": "..." },
  "sentences": [
    { "jp": "ruby-annotated", "translation": "...", "register": "casual|standard|formal", "notes": "..." }
  ],
  "confused_with": { "pattern": "...", "contrast": "..." },
  "bunpro_tip": "..."
}
```

## User context

- Solid N4, working toward N3 by Dec 2026
- Kaishi 1.5k Anki deck complete — one example sentence per word feels thin, especially
  for abstract uses: ところ・よう・もの as grammatical constructions, 見る vs 見える vs 見せる, etc.
- BunPro N4 done, N3 in progress — needs real-world nuance and register variation,
  not just textbook definitions
- Primary gap: the difference between technically correct and naturally flowing Japanese
- Existing tools: Anki, BunPro, Migaku — TSV export feeds Anki directly
- Sibling project: 東京奇譚 (tokyo-kitan/) — same stack, same visual style

## npm scripts

```bash
npm start               # web app at http://localhost:3001
npm run dev             # with --watch (auto-restart)
node src/cli.js 見る    # CLI vocab lookup
node src/cli.js ～てしまう   # CLI grammar lookup
node src/cli.js --tsv 見る   # output Anki TSV
node src/cli.js --raw 見る   # output raw JSON

npm run eval:check      # validate lookup output vs saved snapshots (no API — the gate)
npm run eval:update     # refresh snapshots from the live API (serial; ~18 calls)
npm run eval            # live lookups checked against fresh output (no snapshot write)
```

## Eval harness (`eval/`)

`lookup.js`'s prompt output is the product — `eval/` guards it. `eval/golden.js` holds ~18
representative cases; `eval/checks.js` runs deterministic validators (ruby on every kanji,
JSON contract, sentence count, register variety, confused_with). `eval/run.js` drives three
modes (`check`/`update`/`run`). Live runs are serial with 429 backoff (the org's
output-token/min limit forbids parallelism). After editing a prompt in `lookup.js`: run
`eval:update`, review the snapshot diff, then keep `eval:check` green. Use `/lookup-eval` to
run and interpret it. Never loosen a check to pass — fix the output instead.

## Server restart policy

After editing `src/server.js` or `src/lookup.js`, always restart the server autonomously —
never ask the user to do it. Kill any running instance and start fresh with `npm run dev`.
The `--watch` flag auto-restarts on subsequent file saves during that session, including
changes to `src/anki.js` (imported by `server.js`). Manual restart is only needed when
`.env` changes, since `dotenv` loads at process start.

```bash
pkill -f "node src/server.js" 2>/dev/null; pkill -f "node --watch src/server.js" 2>/dev/null; sleep 0.5
cd "/Users/jasonalmerini/Library/Mobile Documents/com~apple~CloudDocs/VS Code Projects/companion" && npm run dev >> /tmp/companion-server.log 2>&1 &
```

Editing `public/index.html` does NOT require a restart — it's a static file served directly.

## Changelog discipline

After any significant change to `src/` or `public/index.html`, add a changelog entry to
`CLAUDE.md` before considering the task complete. Don't batch this to a docs sweep at the end.

## Development roadmap (2026-06-14 plan)

Phased structural plan (full version archived in `plans/`). Direction: guard the core,
fix the frontend monolith, build discipline tooling, then extract a shared package.

- **Phase 1 — Prompt-output eval harness.** ✅ Done (see `eval/` and the changelog).
- **Phase 2 — Frontend modularization.** Split `public/index.html`'s inline JS into native
  ES modules under `public/js/` (state, render, lookup-client, anki, bunpro, history, tts,
  furigana, main). No build step. Extract one module at a time, re-driving the app after each.
  Keep `tts.js`/`furigana.js`/palette CSS app-agnostic — they become Phase 4 shared code.
- **Phase 3 — Dev tooling & discipline hooks.** Partly done: `/lookup-eval` skill + the
  lookup.js eval nudge hook. Remaining: changelog-nag Stop hook (git-independent, mtime-based),
  optional `.env` staging guard.
- **Phase 4 — Extract shared `jp-ui` package → monorepo with 東京奇譚.** Lift the app-agnostic
  modules + visual palette + `anki.js` client into `packages/jp-ui`; both apps import it.
  `lookup.js` stays companion-only and pure. Do after Phase 2. Own plan when 1–3 land.

### Deferred features (parked until structural work lands)

- VS Code extension that calls lookup.js on selected text (highest-friction reduction)
- Pitch-accent data from a dictionary (current pitch_accent field is AI-generated; a bundled dictionary like Kanjium would be more reliable)
- Grammar → Anki cards (infrastructure exists in anki.js; needs ensureGrammarModel() + frontend section in renderGrammar)
- BunPro API integration to mark grammar points as reviewed directly from the companion

## BunPro integration — infrastructure built, blocked on stable auth

**What's already built** (`src/bunpro.js`, routes in `src/server.js`, frontend in `public/index.html`):
- `GET /api/bunpro/grammar?pattern=` — returns SRS level, next review, streak, lapses for a
  grammar pattern; shown as a status card after every grammar lookup (hidden when not enabled)
- `GET /api/bunpro/troubled` — returns ghost reviews / troubled grammar list; 文法苦手 sliding
  panel in the header (button hidden via `/api/bunpro/status` check when not enabled)

**Why it's not active**: BunPro's public account API key (`bunpro.jp → Account → API`) is for
a defunct v1 API that returns HTML instead of JSON. The working API is the internal frontend API
at `https://api.bunpro.jp/api/frontend/` which requires a short-lived JWT from browser
`localStorage` (`frontend_api_token`). That JWT expires with the browser session, making it too
fragile for a persistent `.env` variable.

**How to turn it on** (when BunPro ships a stable API token or you're comfortable refreshing):
1. Open `bunpro.jp` while logged in
2. DevTools → Application → Local Storage → `https://bunpro.jp`
3. Copy the value of `frontend_api_token`
4. Add `BUNPRO_TOKEN=eyJ...` to `.env` and restart the server
5. The 文法苦手 button and grammar status cards will appear automatically

**API paths (current):**
- `getGrammarStatus`: paginates `GET /reviews?page=N&per_page=500`, pattern-matches results
- `getTroubledGrammar`: tries `GET /user_stats/srs_ghost_level_details?reviewable_type=Grammar` first;
  falls back to filtering the paginated `/reviews` endpoint for `miss_count >= 2`

**What to watch for**: if BunPro ever documents a long-lived API token in account settings,
update `src/bunpro.js` — change `bunproHeaders()` to use that token and update `.env.example`.
The rest of the integration needs no changes.

## Archive conventions

### Source files

Before making significant edits to any file in `src/` or `public/`, copy the current version
to `archive/` with a dated prefix so there's always a recoverable snapshot:

```bash
cp src/lookup.js archive/2026-06-13_lookup.js
cp public/index.html archive/2026-06-13_index.html
```

Also archive when a file is superseded entirely (prompt rewrite, component replaced, etc.) —
in that case the archived copy replaces the original rather than sitting alongside it.

Add a one-line note in the Changelog entry for every archive: what was archived and why.

### Plans

Plans live as a single active file in `.claude/plans/`. Before overwriting it for a new task,
copy it to `plans/` at the repo root so past plans are versioned and referenceable:

```bash
cp ".claude/plans/<active-plan>.md" "plans/YYYY-MM-DD_short-description.md"
```

## Changelog

Reverse-chronological. Add an entry here whenever a feature is added, changed, or
removed. Include the date (YYYY-MM-DD) and a tight bullet list. If a file is
archived, note it here too.

### 2026-06-14 — Prompt-output eval harness (roadmap Phase 1) + truncation fix

- `eval/` directory added — regression harness for `lookup.js` output, the app's core value:
  - `eval/golden.js`: ~18 representative cases (見る family, multi-sense verbs, abstract
    nouns, N3 grammar patterns) as `{ input, mode }`
  - `eval/checks.js`: deterministic validators — `everyKanjiHasRuby` (the #1 invariant),
    `matchesContract`, `sentenceCount` (vocab 5 / grammar 4), `distinctRegisters` (≥3 valid),
    `confusedWithPopulated`. Pure functions, no API. `kanji-ruby` strips `<ruby>…</ruby>`
    blocks then flags any leftover CJK ideograph; excludes `pitch_accent.label` (meta),
    `reading`, `translation`, and `sentences[].notes` (often English) to avoid false positives
  - `eval/run.js`: three modes — `check` (validators vs saved snapshots, no API, the gate),
    `update` (refresh snapshots from live API; serial with 9s pacing + 429 backoff because the
    org output-token/min limit forbids parallelism; `--missing` fills only absent snapshots),
    `run` (live check without writing). Exits nonzero on failure
  - `eval/snapshots/*.json`: 18 committed baseline outputs
- `package.json`: added `eval`, `eval:check`, `eval:update` scripts
- `src/lookup.js`: `max_tokens` 3000 → 5000 in both `lookup()` and `lookupStream()` — the harness
  surfaced that multi-sense entries (～ところ, and especially ～そうだ which covers two grammar
  points) exceeded 3000 tokens and truncated, causing a hard `JSON.parse` crash on common lookups
- `.claude/skills/lookup-eval/SKILL.md`: new `/lookup-eval` skill — runs the harness and interprets
  failures by check group; forbids loosening checks to pass
- `.claude/settings.local.json`: PostToolUse hook now also nudges to run `npm run eval:check` after
  editing `src/lookup.js`; static-file reminder widened from `public/index.html` to any
  `public/**/*.{html,js,css}` (prep for Phase 2 ES modules)
- Archived: `archive/2026-06-14_lookup.js` (auto, via PreToolUse hook, before the max_tokens edit)
- **Known baseline finding**: 7/18 snapshots fail `kanji-ruby` — the model intermittently drops ruby
  on one common kanji (見, 直, 一, 捨, 少, 申, 今, 人) or the linguistic term 形式名詞. Honest red
  baseline; fixing it is a prompt-tuning follow-up, not a harness defect

### 2026-06-14 — J-J mode abort + race-condition fix

- `public/index.html`: added `let lookupAbortController = null;` module-level state
- `public/index.html`: `doLookup()` now aborts any in-flight stream at the top via `lookupAbortController.abort()` — toggling 英語/日本語 while generating cleanly cancels the old stream and starts a new one
- `public/index.html`: `doLookup()` snapshots `jjMode` into `const jjSnapshot` before any `await`; the snapshot is used for the cache lookup, the fetch body (`jj: jjSnapshot`), and the result tag (`evt.result.jj = jjSnapshot`) — ensures the entire call is self-consistent even if `jjMode` changes while the stream is running
- `public/index.html`: `AbortError` in the catch block silently returns (the new lookup owns the UI); all other errors still call `renderError`
- `public/index.html`: loading state + controller cleanup guarded by `lookupAbortController === controller` so only the current (winning) lookup hides the spinner and nulls the controller
- Archived: `archive/2026-06-14_index_pre-abort-fix.html`

### 2026-06-14 — J-J mode cache fix + 英語/日本語 toggle switch

- `public/index.html`: `doLookup()` now stamps `evt.result.input = input` before `addToHistory` — `input` was never set on results, causing: cache never hitting (every lookup hit the API), history dedup collapsing all same-jj entries to 1, history search always returning `''`, history click clearing the search box, and J-J toggle using wrong word when currentResult was out of sync with searchInput
- `public/index.html`: `日日` button replaced with `<div class="lang-switch">` containing `<span class="lang-opt">英語</span>` and `<span class="lang-opt">日本語</span>`; the active language's pill is highlighted pink; clicking anywhere toggles mode
- `public/index.html`: `setJJ()` updated to toggle `.active` on the correct `.lang-opt` span instead of the button container; init line updated to match
- `public/index.html`: CSS added for `.lang-switch`, `.lang-opt`, `.lang-opt.active`
- Archived: `archive/2026-06-14_index_pre-jj-cache-fix.html`

### 2026-06-14 — Companion card furigana: raw HTML fields, drop {{furigana:}} filter

- **Root cause**: Anki's `{{furigana:Field}}` filter distributes multi-mora readings evenly across kanji *characters* — so `座[すわ]` (1 kanji, 2 morae) placed `す` above `座` and orphaned `わ` as inline text. Affects any single kanji with a 2+ mora reading (`本[ほん]`, `人[ひと]`, etc.)
- `src/anki.js`: `addNoteForWord` — `Word Furigana` now stores `<ruby>word<rt>reading</rt></ruby>` HTML (was `word[reading]` Anki-notation); `Sentence Furigana` now stores the raw `sentence.jp` ruby HTML directly (was converted via `rubyToAnkiFurigana`)
- `src/anki.js`: `updateCardSentence` — `Sentence Furigana` written as raw `sentenceHtml` (not converted)
- `src/anki.js`: `enrichAndUpdateCard` — same
- `src/anki.js`: `rubyToAnkiFurigana()` removed (no longer used anywhere)
- `src/anki.js`: `buildCompanionBack()` — `{{furigana:Word Furigana}}` → `{{Word Furigana}}`; `{{furigana:Sentence Furigana}}` → `{{Sentence Furigana}}`; raw HTML fields render directly in the browser without Anki's distribution step
- `src/anki.js`: `COMPANION_CSS` gains `ruby rt { font-size: 0.38em; color: #ff6fa8; }` — pink furigana at correct size (matches app's existing furigana color)
- `src/anki.js`: sentinel bumped `companion-v2` → `companion-v3`; `ensureCompanionModel()` upgrade check now detects `companion-v3` so existing Companion cards auto-upgrade their template on next use
- Archived: `archive/2026-06-14_anki_pre-furigana-fix.js`

### 2026-06-14 — Anki update completeness, new card creation fix, history UX

- `src/anki.js`: `addNoteForWord` now calls `ankiRequest('createDeck', { deck: deckName })` before `addNote` — AnkiConnect does not auto-create the target deck, causing "deck was not found" errors on first-time card creation
- `src/anki.js`: `updateCardSentence` extended with `word` and `sentenceHtml` params; conditionally writes `Sentence Highlighted` (`highlightWordInSentence`) and `Sentence Furigana` (`rubyToAnkiFurigana`) when those fields exist on the note type — previously only the plain `Sentence` field was updated
- `src/anki.js`: `enrichAndUpdateCard` extended with `sentenceHtml` param; writes `Sentence Highlighted` and `Sentence Furigana` during enrichment of non-standard note types
- `src/server.js`: `POST /api/anki/card/sentence` now destructures and forwards `word` + `sentenceHtml` to `updateCardSentence`; `POST /api/anki/card/enrich` passes `sentence.html` to `enrichAndUpdateCard`
- `public/index.html`: sentence update fetch body now includes `word: currentResult.word || currentResult.input` and `sentenceHtml: jpHtml`; enrich fetch body's sentence object gains `html: jpHtml`
- `public/index.html`: history panel bulk TSV export button removed (was unused)
- `public/index.html`: per-item delete button (✕) added to each history entry — hidden until hover, shows confirm dialog, removes only that entry from localStorage and the DOM; `e.stopPropagation()` prevents the entry's click-to-render from also firing
- `public/index.html`: `.h-del-btn` CSS added (ghost button, pink on hover, opacity transition)
- Archived: `archive/2026-06-14_server_pre-update-fields.js`

### 2026-06-14 — UX polish + furigana consistency + 日日 live-switch

- `public/index.html`: TTS bug fix — Chrome/macOS: `speak()` silently fails right after `cancel()`; fixed by wrapping the speak call in `setTimeout(doSpeak, 50)` to flush the cancellation
- `public/index.html`: TTS voice randomization — `speak()` now picks randomly from Enhanced/Premium Japanese voices (`name.includes('Enhanced') || name.includes('Premium')`) on each new utterance; pause/resume holds the same voice; falls back to any Japanese voice if none are enhanced
- `public/index.html`: panel UX — 閉じる moved to top of 苦手 and 文法苦手 panels (was at the bottom, required scrolling); 更新 also moved to top of 苦手 panel; both panels now open with controls immediately visible
- `public/index.html`: history re-sort on click — history entry click calls `addToHistory(r)` before rendering so the selected item moves to the top of the list on next panel open
- `public/index.html`: furigana CSS scope fix — `#result ruby { color: var(--cyan) }` and its `hide-furigana` revert rule both extended to include `#paste-results ruby`; paste-mode kanji now color correctly
- `public/index.html`: ruby on header buttons — 苦手, 文法苦手, 調べる, 読む kanji now wrapped in `<ruby>` tags (履歴 already had them; others were plain text)
- `public/index.html`: 日日 live-switch — `setJJ(on)` now calls `doLookup()` when `currentResult` is set, immediately re-fetching/re-rendering in the new mode; toggling back to a cached mode is instant (history cache keyed on `{input, jj}`)
- `public/index.html`: removed dead `escHtml()` function (defined but never called)
- `src/lookup.js`: removed `detectMode` from `module.exports` (internal helper, no external callers)

### 2026-06-14 — Kaishi 1.5k card layout for Companion note type

- `src/anki.js`: added `formatPitchHtml(reading, pitchAccent)` — port of the frontend pitch contour renderer; stores visual H/L overline spans directly in the Anki `Pitch` field so cards display pitch without JS
- `src/anki.js`: added `highlightWordInSentence(sentence, word)` — wraps the target word in `<b>` tags (CSS rule `b{color:#4fd8e8}` makes it cyan, matching Kaishi's `b{color:#5586cd}` approach)
- `src/anki.js`: `COMPANION_CSS` / `COMPANION_FRONT` / `buildCompanionBack()` constants replace the old inline template strings; CSS now matches Kaishi sizes exactly (44px base, Hiragino/Noto Sans, font sizes 44/24/25/20px per element matching Kaishi's inline styles)
- `src/anki.js`: new Companion fields — `Word Furigana` (`word[reading]` notation, rendered with `{{furigana:Word Furigana}}` on back like Kaishi), `Pitch` (HTML contour), `Sentence Highlighted` (`<b>word</b>` in plain sentence for front), `Sentence Furigana` (Anki `漢字[かんじ]` notation for back)
- `src/anki.js`: front template now shows Word (44px) + Sentence Highlighted (20px) matching Kaishi's front; back shows Word Furigana → Pitch → Meaning → Sentence Furigana → TTS → Sentence Meaning
- `src/anki.js`: `ensureCompanionModel()` auto-upgrades existing Companion models — adds missing fields via `modelFieldAdd`, detects old template via `<!-- companion-v2 -->` sentinel, updates template + CSS on first call after upgrade
- `src/anki.js`: `addNoteForWord()` now populates all new fields from `result.pitch_accent`, `sentence.jp` (ruby HTML), and `result.word`
- Archived: `archive/2026-06-14_anki_pre-kaishi-template.js`

### 2026-06-14 — J-J mode (日日モード)

- `src/lookup.js`: added `VOCAB_SYSTEM_JJ` and `GRAMMAR_SYSTEM_JJ` — same JSON schema as the standard prompts but all explanatory prose in JLPT N4–N5 Japanese; `sentences[].translation` stays in English as a safety net; furigana rules unchanged
- `src/lookup.js`: `lookup(input, opts)` selects the JJ system prompt when `opts.jj` is true; `lookupStream(input, opts={})` gains the same opts parameter and selection logic
- `src/server.js`: all three stream/lookup routes now destructure `jj` from the request body and forward it to `lookup()`/`lookupStream()`
- `public/index.html`: `jjMode` state variable persisted to `localStorage` (`companion_jj_v1`); 日日 toggle button added to header (same `ctrl-btn` style as ふりがな/ローマ字); `setJJ()` function; fetch bodies for lookup stream and paste stream include `jj: jjMode`; history cache now matches on `{input, jj}` so J-J and J-E results for the same word coexist; results tagged with `r.jj` before caching; `addToHistory()` deduplicates on `{input, jj}` pair
- Archived: `archive/2026-06-14_lookup_pre-jj.js`, `archive/2026-06-14_server_pre-jj.js`, `archive/2026-06-14_index_pre-jj.html`

### 2026-06-13 — Pitch accent display + context-aware 読む mode

- `src/lookup.js`: `lookup(input, opts={})` now accepts `opts.context`; when set, appends `Context sentence: …` to the user message so Claude tailors core_meaning and example sentences to the specific usage shown in the source text
- `src/lookup.js`: `identifyWords()` updated to return `sentence` field per word — the complete source sentence the word appeared in
- `src/lookup.js`: `VOCAB_SYSTEM` gains `pitch_accent` in the JSON schema (`number`, `label`, `pattern`) — AI-generated Tokyo standard accent; note this is approximate (a dictionary-backed source is on the roadmap)
- `src/lookup.js`: both `VOCAB_SYSTEM` and `GRAMMAR_SYSTEM` gain a "Context sentence" instruction so the model uses it when present
- `src/server.js`: `/api/paste/stream` now destructures `sentence` from each identified word and passes `{ context: sentence }` to `lookup()` — each word is explained in the context of its source sentence
- `public/index.html`: `.pitch-badge` CSS added (yellow, bordered); `renderVocab()` header now shows `[N] ラベル` badge with H/L pattern in tooltip when `pitch_accent` is present
- `README.md`: Troubleshooting section added — AnkiConnect not responding, BunPro token refresh instructions
- Archived: `archive/2026-06-13_lookup_pre-pitch-context.js`, `archive/2026-06-13_index_pre-pitch-context.html`, `archive/2026-06-13_server_pre-paste-context.js`

### 2026-06-13 — BunPro integration: grammar SRS status + 文法苦手 panel

- `src/bunpro.js`: new AnkiConnect-style client module; `getGrammarStatus(pattern)` fetches `/reviews/all` and pattern-matches (normalising ～/〜) to return SRS level, next review, streak, lapses, JLPT; `getTroubledGrammar()` tries `/ghost_reviews` first, falls back to filtering `/reviews/all` for lapses ≥ 2; both silent when `BUNPRO_API_KEY` is absent; `mapReviewItem()` handles v1 API field variants
- `src/server.js`: added `GET /api/bunpro/grammar?pattern=` and `GET /api/bunpro/troubled` routes; both return 503 with clear message when key is not set
- `public/index.html`: BunPro status card injected into `renderGrammar()` (gated on `!opts.compact`); `checkBunproStatus(result)` fires after every grammar lookup; colour-coded SRS level pills (ghost=pink, master=cyan, seasoned=purple, adept=yellow); 文法苦手 button opens sliding panel with troubled grammar list; click-to-lookup sets pattern with ～ prefix so grammar mode fires correctly
- `.env.example`: added `BUNPRO_API_KEY` comment
- Archived: `archive/2026-06-13_index_pre-bunpro.html`, `archive/2026-06-13_server_pre-bunpro.js`

### 2026-06-13 — 読む mode (JRPG paste mode)

- `src/lookup.js`: added `identifyWords(text)` — one Claude call (effort: low) that reads a paragraph and returns `[{word, reading, reason}]` for 5–12 N3-range words worth explaining; excludes particles and ultra-common N5/N4 vocabulary; grammar patterns output with ～ prefix so `detectMode()` routes them correctly; exported alongside existing functions
- `src/server.js`: added `POST /api/paste/stream` SSE route — calls `identifyWords()`, sends `{type:'identified', words}` immediately so the UI can render placeholders, then fires `Promise.all(words.map(lookup))` and streams each `{type:'result', word, result}` as its promise resolves; ends with `{type:'done'}`
- `public/index.html`: added 読む/調べる mode tab toggle above the search row; paste panel with textarea + 解析する button; SSE consumer that renders placeholder cards on `identified` event and fills them in-place on `result` events; bulk TSV export button appears after all results load; `renderVocab()` and `renderGrammar()` now accept `opts.compact` to suppress the Anki card section and export bar (prevents duplicate IDs when multiple words render on one page)
- Archived: `archive/2026-06-13_lookup_pre-paste.js`, `archive/2026-06-13_index_pre-paste.html`

### 2026-06-13 — Documentation catch-up + push skill

- `CLAUDE.md` Architecture: added `src/anki.js` to file map
- `CLAUDE.md` Design decisions: added #8 covering the full Anki integration (AnkiConnect, enrichment, TTS, two-click confirm, 苦手 panel)
- `CLAUDE.md` Server restart policy: clarified that `--watch` covers `src/anki.js`; manual restart only needed for `.env` changes
- `CLAUDE.md` Roadmap: removed "Example sentence audio via TTS" — built (Web Speech API in app, Anki TTS on cards)
- `README.md`: added Anki to Stack, added Dependencies section (AnkiConnect add-on ID), added Anki env vars to Setup, expanded Features with Ankiカード panel, → Anki buttons, card enrichment, Anki TTS, 苦手 panel, TTS ▶ buttons, history search
- `.claude/skills/push/SKILL.md`: new GitHub push skill — stages safe files, commits, pushes; safety rules prevent `.env` staging and force-push

### 2026-06-13 — Show deck name in Ankiカード section

- `src/anki.js`: `findNoteForWord` now calls `cardsInfo` on the first card of the note to retrieve `deckName`; included in the return object (and thus in `GET /api/anki/card` response automatically)
- `public/index.html`: Ankiカード body "現在の例文" label now sits in a flex row with a `register-tag` badge showing the deck name on the right; badge hidden when no card found
- Archived: `archive/2026-06-13_anki.js`, `archive/2026-06-13_index.html`

### 2026-06-13 — Word TTS before sentence TTS on enriched cards

- `src/anki.js`: `patchModelWithSentenceSection` now injects `{{#Reading}}{{tts...:Reading}}{{/Reading}}` before the `{{#Sentence}}` block — enriched cards play the word (hiragana) then the sentence, matching Kaishi 1.5k's word-audio → sentence-audio order
- Upgrade path handles both missing block (insert) and stale voices (regex replace inside block)

### 2026-06-13 — Fix duplicate TTS on enriched cards

- `src/anki.js`: `patchModelForTTS` now detects `{{#Sentence}}` sections and delegates to `patchModelWithSentenceSection` instead of appending a conflicting standalone tag — eliminates double sentence reading on enriched (Pokemon-style) cards
- `src/anki.js`: `patchModelWithSentenceSection` now uses a regex to upgrade ANY `{{tts...:Sentence}}` tag inside the section (not just bare→voices), and strips standalone sentence TTS tags that accumulated outside the section
- Directly patched "Basic-2 Field" back template via AnkiConnect to remove stale `{{tts ja_JP:Front}}` and duplicate sentence TTS tags left by prior conflicting patches

### 2026-06-13 — TTS premium voices + confirm before Anki send

- `src/anki.js`: added `buildTtsTag(fieldKey)` — returns `{{tts ja_JP voices=...:field}}` when `ANKI_TTS_VOICES` env var is set, otherwise bare `{{tts ja_JP:field}}`
- `src/anki.js`: added `upgradeModelTTSTag(modelName, fieldKey)` — replaces bare TTS tag in an existing back template with the voices version; no-op if voices not configured or already upgraded
- `src/anki.js`: `patchModelForTTS` updated to use `buildTtsTag`; upgrades existing bare tags before appending new ones (idempotent upgrade path)
- `src/anki.js`: `patchModelWithSentenceSection` updated to use `buildTtsTag`; upgrades bare TTS tag inside existing `{{#Sentence}}` sections
- `src/anki.js`: `ensureCompanionModel` Back template now uses `buildTtsTag('Sentence')`; calls `upgradeModelTTSTag` on the already-exists path so old Companion templates auto-upgrade
- `.env.example`: added `ANKI_TTS_VOICES` with comment explaining how to find macOS voice IDs
- `public/index.html`: `→ Anki` buttons now require two clicks — first click enters "確定?" state (yellow, 3s auto-cancel); second click executes; clicking elsewhere cancels
- `public/index.html`: added `cancelPendingAnki()`, `pendingAnkiBtn`/`pendingTimer` state, document-level capture listener for outside-click cancel, `.anki-send-btn.pending` CSS
- Archived: `archive/2026-06-13_anki.js`, `archive/2026-06-13_index.html` (pre-TTS-voices/confirm snapshots)

### 2026-06-13 — Enrich non-standard cards in place (preserve review history)

- `src/anki.js`: `findNoteForWord` now returns `needsMigration: bool` (true when sentence field was found via template analysis, not SENTENCE_KEYS name match)
- `src/anki.js`: added `enrichNoteType(modelName, requiredFields)` — uses AnkiConnect `modelFieldNames` + `modelFieldAdd` to expand a note type's schema with Companion fields (Reading, Meaning, Sentence, Sentence Meaning, Frequency, Notes) without touching existing fields or cards
- `src/anki.js`: added `patchModelWithSentenceSection(modelName)` — appends conditional `{{#Sentence}}...{{/Sentence}}` block (with TTS) to the note type's back template; idempotent
- `src/anki.js`: added `enrichAndUpdateCard(noteId, modelName, result, jpPlain, translation)` — orchestrates enrichNoteType → updateNoteFields → patchModelWithSentenceSection; review history fully preserved
- `src/server.js`: added `POST /api/anki/card/enrich` route
- `public/index.html` `checkAnkiCard`: when `data.needsMigration`, status explains that Companion fields will be added to the card
- `public/index.html` send handler: when `currentAnkiNote.needsMigration`, calls `/api/anki/card/enrich` (full enrichment path) instead of `/api/anki/card/sentence`

### 2026-06-13 — Auto-detect sentence field from card template; remove field picker

- `src/anki.js`: added `extractTemplateFields(template)` — regex extracts field references from an Anki template string, skipping FrontSide/tts/conditional tags
- `src/anki.js`: added `detectBackField(modelName, fieldNames)` — fetches the note type's card templates via AnkiConnect, finds the first field that appears on the back but not the front (excluding WORD_KEYS); called as fallback in `findNoteForWord` when SENTENCE_KEYS name-matching fails
- `src/anki.js`: `findNoteForWord()` now calls `detectBackField` when no sentence field is matched by name — Pokémon Back/English fields auto-detected without user input
- `public/index.html` `checkAnkiCard`: removed field picker (`<select>` dropdown, all picker logic, picker change handler); replaced with simple fallback message if field still undetected (rare)
- `public/index.html`: removed `ANKI_FIELDS_KEY`, `loadAnkiFields()`, `saveAnkiField()` — no longer needed

### 2026-06-13 — Field picker: persist choice per note type + remove stale VoiceVox text

- `public/index.html`: added `ANKI_FIELDS_KEY`, `loadAnkiFields()`, `saveAnkiField()` using `companion_ankifields_v1` localStorage key (maps `modelName → sentenceFieldKey`)
- `public/index.html` `checkAnkiCard`: when `sentenceFieldKey` is empty, checks localStorage for a saved field for this note type before showing the picker; if found, auto-applies it and shows `（前回の選択）` status; picker only shown on first encounter; picker `change` handler saves the choice so future lookups skip it
- `public/index.html` `checkAnkiCard`: removed "(VoiceVox起動中なら…)" from both the update and create status strings

### 2026-06-13 — Replace VoiceVox with Anki built-in TTS

- `src/anki.js`: added `ensureCompanionModel()` — creates "Companion" note type via AnkiConnect on first card create; back template includes `{{tts ja_JP:Sentence}}` so system TTS plays at review time with no extra software
- `src/anki.js`: added `patchModelForTTS()` — appends conditional `{{tts}}` to any existing note type's back template when we update its sentence; idempotent (skips if already present); wraps in `{{^SentenceAudio}}...{{/SentenceAudio}}` so pre-recorded audio still takes priority on un-updated cards
- `src/anki.js`: `updateCardSentence()` now clears the sentence audio field (sets to `''`) so stale audio doesn't override TTS on updated cards; passes `modelName` to `patchModelForTTS`; word audio field untouched
- `src/anki.js`: `addNoteForWord()` rewritten — calls `ensureCompanionModel()`, uses Companion note type (not Kaishi 1.5k); no audio generation
- `src/anki.js`: `findNoteForWord()` now returns `modelName` from note info
- `src/anki.js`: removed `generateSentenceAudio()` and `storeAudioAndGetTag()` (VoiceVox dependency gone)
- `src/server.js`: `/api/anki/card/sentence` now accepts and forwards `modelName`
- `public/index.html`: anki-send-btn handler sends `modelName` from `currentAnkiNote`
- `.env.example`: removed `VOICEVOX_URL`, `VOICEVOX_SPEAKER`; added `ANKI_COMPANION_MODEL`
- `archive/2026-06-13_anki.js` — snapshot before rewrite

### 2026-06-13 — Non-Kaishi deck support: field picker + response error handling

- `src/anki.js` `findNoteForWord`: now returns `allFields: Object.keys(fields)` so the frontend knows every field on the note
- `src/anki.js` `updateCardSentence`: added guard — throws early if `sentenceFieldKey` is empty instead of silently sending `fields: {'': text}` to AnkiConnect
- `public/index.html` `checkAnkiCard`: when `data.found && !data.sentenceFieldKey` (unknown deck schema), shows a `<select>` dropdown of all note fields; `→ Anki` buttons stay hidden until user picks a field; `currentAnkiNote.sentenceFieldKey` is updated on change
- `public/index.html` send handler: now checks `res.ok` after both update and create fetches; only updates displayed sentence text on confirmed success; throws on failure so the catch block shows ✗

### 2026-06-13 — Anki card sentence viewer + replacer + card creator

- `src/anki.js`: added `findNoteForWord`, `updateCardSentence`, `addNoteForWord`, `getDeckNames`, `generateSentenceAudio`, `storeAudioAndGetTag`, `rubyToAnkiFurigana`
- `src/server.js`: 4 new routes — `GET /api/anki/card`, `POST /api/anki/card/sentence`, `POST /api/anki/card/create`, `GET /api/anki/decks`
- `public/index.html`: `checkAnkiCard()` fires after every vocab result; "Ankiカード" section shows current sentence or "no card" state; `→ Anki` button on every example sentence (vocab only) replaces existing sentence or creates new card
- New cards go to `"Companion"` deck (`ANKI_COMPANION_DECK` env var) using Kaishi 1.5k note type — all fields populated (Word, Reading, Furigana, Meaning, Sentence, Sentence Meaning, Sentence Furigana, Frequency, Notes)
- VoiceVox integration: sentence audio generated via local API (`VOICEVOX_URL`, `VOICEVOX_SPEAKER`) and stored via AnkiConnect `storeMediaFile`; graceful no-op if VoiceVox not running
- `.env.example` updated with new env vars

### 2026-06-13 — TTS furigana fix + pause/resume

- `speak()` now takes `(text, btn)` — tracks `activeSpeakBtn` module-level; same button toggles pause/resume, different button cancels current and starts new
- Furigana double-read fixed: clone `.sentence-jp`, `querySelectorAll('rt').forEach(rt => rt.remove())`, then `.textContent` — same pattern as 東京奇譚 `sceneSpokenText()`
- ▶ button now shows ⏸ while playing; `utt.onend` resets it to ▶

### 2026-06-13 — archive conventions expanded + snapshots

- CLAUDE.md: "Archive conventions" split into Source files + Plans subsections; source file archiving now applies before significant edits, not just on full replacement
- `archive/2026-06-13_lookup.js`, `archive/2026-06-13_index.html` — first source snapshots under the new convention

### 2026-06-13 — TTS audio + history search/filter + plan archive

- TTS: `speak(text)` added using Web Speech API; `▶` button on every example sentence in both vocab and grammar modes; delegated listener on `#result`; `lang: 'ja-JP'`, rate 0.9, handles async `voiceschanged` for first-load
- History panel: `filterHistory(query, mode)` added; search input + 全て/単語/文法 mode pills injected on each open (resets state); `data-word` and `data-mode` attributes on each `.history-entry` for filtering
- CLAUDE.md: "Plan archive" convention added — copy active plan to `plans/YYYY-MM-DD_description.md` before overwriting
- `plans/` directory created at repo root; `plans/2026-06-13_tts-audio-history-search.md` is the first archived plan

### 2026-06-12 — furigana scope fix

- Tightened IMPORTANT rule in both system prompts: "kanji character (CJK ideograph)" replaces "kanji character anywhere" — explicitly prohibits ruby tags on English words, Roman letters, and Latin-alphabet proper nouns
- SENTENCE RULES footer updated to match in both VOCAB_SYSTEM and GRAMMAR_SYSTEM

### 2026-06-12 — coloring system, streaming fixes, token limit

- `max_tokens` raised 1800 → 3000 in both `lookup()` and `lookupStream()` — furigana-annotated
  responses were regularly truncating; 3000 gives safe headroom for complex vocab entries
- Stream error handling: `lookupStream()` now throws on `error` and non-`end_turn` stop events;
  `/api/lookup/stream` catch block falls back to non-streaming `lookup()` so users always get a result
- Progressive streaming render: chunks parsed with brace-tracker as they arrive; result cards appear
  incrementally instead of waiting for full response or showing raw JSON
- History array doubles as lookup cache: `doLookup()` checks history before hitting the API —
  repeated lookups re-render from cache with no API call
- Sentence coloring: kanji cyan (`#result ruby`), kana near-white (`.sentence-jp` color `--text`);
  furigana toggle reverts kanji to inherit making sentences uniformly near-white when off
- 苦手 panel: ふりがな toggle button added to panel header (ctrl-btn style, synced with global toggle) — **later removed** (see below)
- Double furigana in 混同しやすい表現 card fixed: `confused_with.word` now rendered directly without outer `<ruby>` wrapper (Claude already annotates individual kanji)
- 苦手 panel: removed all furigana — cards show raw word only (no ruby, no toggle button); point is recognition practice without reading hints

### 2026-06-12 — streaming API response

- Added `lookupStream(input)` async generator in `src/lookup.js` — makes the same Anthropic call with `stream: true`, yields `{type:'chunk', text}` deltas then a final `{type:'done', result}` with the parsed result
- Added `POST /api/lookup/stream` SSE route in `server.js` — proxies text deltas and the final result to the browser as `text/event-stream`
- Frontend `doLookup()` now consumes the stream: shows accumulating JSON in a `.stream-preview` pane as tokens arrive, then snaps to the full structured render when done
- Existing `POST /api/lookup` and `lookup()` untouched — CLI and history re-render unchanged

### 2026-06-12 — API latency optimization

- `output_config: { effort: 'medium' }` added to API call in `src/lookup.js` — drops from the default `"high"` effort (slowest) to `"medium"` (balanced), meaningfully reducing response time for structured JSON generation
- `max_tokens` lowered from 2000 → 1400 — caps worst-case generation time; typical responses are 800–1300 tokens so this leaves comfortable headroom

### 2026-06-12 — furigana toggle in 苦手 panel

- Cards with available readings now render as `<ruby>` elements so the global ふりがな toggle applies to the panel automatically

### 2026-06-12 — UI polish: 苦手 button, deck filter, font scaler

- 苦手 button now pink-bordered (#anki-btn rule) to distinguish it from passive toggle buttons
- Anki panel now shows deck filter pills above card list; client-side show/hide by deck, all selected by default, minimum one always active
- Font size scaler (−/100%/+) added to header-right; uses `--s` CSS variable + `calc(17px * var(--s))`; Ctrl+scroll also works; range 50%–200%

### 2026-06-12 — AnkiConnect struggling cards panel

- Added `src/anki.js` — queries AnkiConnect at `http://localhost:8765` for cards with `lapses >= 2`, extracts word/reading from deck fields, returns sorted by lapse count
- Added `GET /api/anki/struggling?minLapses=2&limit=50` route in `server.js`
- Added 苦手 button in header and sliding panel in frontend; clicking any card sets the search input and fires a lookup automatically
- Field extraction handles multiple deck schemas (Word/Vocabulary/Front/Expression, Reading/Furigana/Kana)

### 2026-06-12 — furigana consistency fix

- Fixed `confused_with.word` always rendering as plain 【】brackets — now uses `<ruby>` tags (reading field was already separate)
- Strengthened both system prompts: added top-level IMPORTANT rule requiring ruby on ALL kanji everywhere, plus per-field reminders in the JSON template for `core_meaning`, `dont_use`, `confused_with.contrast`, `frequency`, `anki_hint`, `real_meaning`, `formation.rule`, `formation.common_mistake`, `bunpro_tip`
- Fixed model ID: `claude-sonnet-4-20250514` → `claude-sonnet-4-6`

### 2026-06-12 — initial documented state

- Web app + CLI shipped with full vocab and grammar modes
- WanaKana IME (romaji→kana, toggleable), furigana toggle, live mode-pill
- History: last 50 lookups in localStorage, click-to-rerender with no API re-call
- Anki TSV export: per-result copy button and full history bulk export
- Copy as JSON button per result
- Model: `claude-sonnet-4-20250514`, single API call per lookup, max_tokens 2000
- README expanded: stack section, dev script, copy buttons, history re-render, sibling note
