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
```

## Server restart policy

After editing `src/server.js` or `src/lookup.js`, always restart the server autonomously —
never ask the user to do it. Kill any running instance and start fresh with `npm run dev`.
The `--watch` flag auto-restarts on subsequent file saves during that session.

```bash
pkill -f "node src/server.js" 2>/dev/null; pkill -f "node --watch src/server.js" 2>/dev/null; sleep 0.5
cd "/Users/jasonalmerini/Library/Mobile Documents/com~apple~CloudDocs/VS Code Projects/companion" && npm run dev >> /tmp/companion-server.log 2>&1 &
```

Editing `public/index.html` does NOT require a restart — it's a static file served directly.

## Changelog discipline

After any significant change to `src/` or `public/index.html`, add a changelog entry to
`CLAUDE.md` before considering the task complete. Don't batch this to a docs sweep at the end.

## Roadmap (discussed, not built)

- VS Code extension that calls lookup.js on selected text (highest-friction reduction)
- Pitch-accent data (lookup from pitch accent dictionary alongside AI output)
- JRPG dialogue paste mode: paste a paragraph of DQ11/Yakuza script, get all unknown
  words flagged and explained in bulk (one call, returns array of vocab entries)
- Example sentence audio via TTS (same Web Speech API pattern as 東京奇譚)
- BunPro API integration to mark grammar points as reviewed directly from the companion

## Archive conventions

When a file is superseded (prompt rewrite, component replaced, config swapped out),
don't delete it — move it to `archive/` at the repo root with a dated prefix:

```
archive/YYYY-MM-DD_original-filename.ext
```

Then add a one-line note in the Changelog entry below: what was archived and why.
This keeps reference material available without cluttering the active source tree.

## Plan archive

Plans live as a single active file in `.claude/plans/`. Before overwriting it for a new task,
copy it to `plans/YYYY-MM-DD_description.md` in the repo root so past plans are versioned
and referenceable:

```bash
cp ".claude/plans/<active-plan>.md" "plans/YYYY-MM-DD_short-description.md"
```

## Changelog

Reverse-chronological. Add an entry here whenever a feature is added, changed, or
removed. Include the date (YYYY-MM-DD) and a tight bullet list. If a file is
archived, note it here too.

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
