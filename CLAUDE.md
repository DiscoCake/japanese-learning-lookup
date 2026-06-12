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

1. **Single API call per lookup.** No follow-up calls, no streaming.
   Token-conscious by design (same principle as 東京奇譚).

2. **Auto mode detection in lookup.js and frontend.**
   - Starts with ～ or 〜, or contains those characters → grammar mode
   - Pure hiragana 3+ chars → grammar mode
   - Everything else → vocab mode
   The frontend shows a live mode-pill as the user types so they know which mode will fire.

3. **All Japanese output has ruby furigana on every kanji.**
   `<ruby>漢字<rt>かんじ</rt></ruby>` — same rule as 東京奇譚.
   Furigana color: pink (#ff6fa8). Main JP text color: teal (#4fd8e8).

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

## Changelog

Reverse-chronological. Add an entry here whenever a feature is added, changed, or
removed. Include the date (YYYY-MM-DD) and a tight bullet list. If a file is
archived, note it here too.

### 2026-06-12 — initial documented state

- Web app + CLI shipped with full vocab and grammar modes
- WanaKana IME (romaji→kana, toggleable), furigana toggle, live mode-pill
- History: last 50 lookups in localStorage, click-to-rerender with no API re-call
- Anki TSV export: per-result copy button and full history bulk export
- Copy as JSON button per result
- Model: `claude-sonnet-4-20250514`, single API call per lookup, max_tokens 2000
- README expanded: stack section, dev script, copy buttons, history re-render, sibling note
