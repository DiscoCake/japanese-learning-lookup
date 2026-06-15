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

npm run test:smoke      # 10-check golden-path Playwright smoke test (requires server running)
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

After any significant change to `src/` or `public/`, add an entry to `CHANGELOG.md` before
considering the task complete. Don't batch this to a docs sweep at the end.

## Development roadmap

Phases 1–6 complete as of 2026-06-14. Full history in `CHANGELOG.md`.

**Phase 5 (complete): mobile usage (read-on-the-go lookups).** Server binds to `0.0.0.0`
(all interfaces — reachable via Tailscale or LAN). In-memory rate limiter on Claude-calling
routes (default 30/min/IP, `RATE_LIMIT_PER_MIN` env var). Single `@media (max-width: 480px)`
block in `index.html`: larger touch targets, wrapped header, tighter panel padding, always-
visible history ✕ button, `苦手`/`文法苦手` hidden on mobile (AnkiConnect is desktop-only).
WanaKana romaji→kana IME defaults off on touch devices (native JP IME handles kana). Live
Anki enrichment, public hosting, and a mobile-first redesign are intentionally deferred.
See the "Mobile / remote access (Tailscale)" section of `README.md` for setup instructions.

**Phase 6 (complete): JJ mode quality + mobile polish.** JJ system prompts rewritten —
removed 国語辞典 framing, added concrete constraint block (40-char sentence target, forbidden
N2+ vocabulary, per-kanji ruby reminder). Eval harness expanded to 26 cases (3 JJ); new
`jjSentenceLength` check; JJ prose ruby exempted (model reliably omits ruby on common kanji
in natural JP prose; sentences[i].jp still enforced). Word-level speak button on vocab card
header. Mobile TTS voice selection fixed (localService fallback for iOS).

**Short-term roadmap (Phase 7 candidates — mobile UX):**

- **Clipboard paste button** — one-tap to paste from clipboard into the search field
  (`public/index.html`, tiny JS, no server change)
- **PWA manifest + home screen icon** — `manifest.json` + `<link rel=manifest>` in
  `index.html`; gives standalone mode, splash screen, app icon on iPhone home screen
- **iOS Shortcut for share-sheet lookup** — Shortcut that POSTs to the server and opens
  the result; zero server code, configured once in the Shortcuts app
- **Swipe down to clear / return to search** — touch gesture on result panel; more native
  than tapping the header on mobile
- **Haptic feedback on Anki send** — `navigator.vibrate(50)` on confirm + success; one line

Deferred: BunPro auth (blocked on stable API token — see BunPro section), VS Code extension
(Yomitan + Migaku cover this for now), live mobile Anki, public hosting with auth.

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

**Cleanup:** after a PR merges to main, delete all archive files from that branch — git history
is the real archive from that point. The `/new-branch` skill includes this step.

### Plans

Plans live as a single active file in `.claude/plans/`. Before overwriting it for a new task,
copy it to `plans/` at the repo root so past plans are versioned and referenceable:

```bash
cp ".claude/plans/<active-plan>.md" "plans/YYYY-MM-DD_short-description.md"
```

## Changelog

Full history lives in `CHANGELOG.md`. Add new entries there, not here.

<!-- entries moved to CHANGELOG.md on 2026-06-14 -->

