# Japanese Study Companion

Vocab and grammar deep-diver for N4→N3 learners. One word or grammar pattern in,
rich contextual breakdown out — multiple example sentences, register notes, confusion
traps, and one-click Anki TSV export.

## Stack

- **Backend**: Node.js + Express (proxy to Anthropic Claude API)
- **Frontend**: Vanilla JS, no build step — open `public/index.html` via the server
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`), streaming SSE with non-streaming fallback
- **IME**: [WanaKana](https://wanakana.com/) for romaji→kana conversion
- **Anki**: AnkiConnect add-on at `localhost:8765` — optional, required only for card features

## Dependencies

- **AnkiConnect** (Anki add-on ID [2055492159](https://ankiweb.net/shared/info/2055492159)) — Anki must be open for the Ankiカード and 苦手 features. The app works fully without it; Anki sections are silently absent.

## Setup

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm start              # → http://localhost:3001
npm run dev            # same, with --watch (auto-restart on file changes)
```

Optional Anki env vars (add to `.env`):

```bash
ANKI_COMPANION_DECK=Companion        # deck for new cards (auto-created)
ANKI_COMPANION_MODEL=Companion       # note type for new cards (auto-created)
ANKI_TTS_VOICES=Apple_Kyoko_(Enhanced),Apple_Otoya_(Enhanced)
# run `say -v '?' | grep ja_JP` to list installed voices
```

## CLI

```bash
node src/cli.js 見る              # vocab lookup
node src/cli.js ～てしまう        # grammar lookup
node src/cli.js --tsv ところ      # Anki TSV output
node src/cli.js --raw 見える      # raw JSON output
```

## What it does

**Vocab mode** (auto-detected for words):
- 5 example sentences across varied registers and contexts
- Core meaning honest description — not just a dictionary gloss
- When NOT to use this word (the negative space SRS cards miss)
- Contrast with the most confused similar word
- Frequency / register note
- One Anki card hint capturing the key nuance

**Grammar mode** (auto-detected for patterns starting with ～/〜):
- What the pattern *actually* expresses beyond the textbook definition
- Formation rules + the most common learner mistake
- 4 example sentences: casual, standard, formal, and one tricky edge case
- Contrast with the most confused grammar pattern (minimal pair included)
- BunPro-specific tip for drilling

## Features

- Romaji→kana auto-conversion (WanaKana) — toggle off for OS IME
- Furigana on all kanji with global show/hide toggle
- Kanji highlighted cyan when furigana is on; reverts to surrounding text color when off
- Live mode-pill — shows vocab vs grammar as you type before submitting
- Streaming responses — result cards appear progressively as tokens arrive; automatic fallback to non-streaming if stream is interrupted
- History (last 50 lookups, persisted in localStorage) — click any entry to re-render from cache, no API re-call; history doubles as a lookup cache so repeated searches skip the API entirely
- History search + filter by mode (単語/文法)
- Copy buttons per result: Anki TSV (HTML stripped) or raw JSON
- Anki TSV export: per-result copy or full history bulk export
- TTS playback (▶) on every example sentence via Web Speech API — pause/resume supported
- **Ankiカード panel** (vocab mode) — shows the current sentence on your existing card and which deck it's in, or "no card" state with one-click creation into the Companion deck
- **→ Anki buttons** on every example sentence — two-click confirm (確定?, 3s auto-cancel) to replace the card's sentence or create a new card; auto-detects the sentence field across any note type
- **Card enrichment** — non-standard note types (any deck, not just Kaishi) get Companion fields added in-place (Reading, Meaning, Sentence, Sentence Meaning, Frequency, Notes) without touching review history
- **Built-in Anki TTS** — updated cards play word then sentence using system TTS at review time; premium macOS voices used when `ANKI_TTS_VOICES` is set
- **苦手 panel** — pulls cards with ≥2 lapses from AnkiConnect; filter by deck; click any word to look it up instantly

See `CLAUDE.md` for architecture and design decisions.

---

Sibling project: [東京奇譚](../tokyo-kitan/) — same visual palette and stack.

**Repo:** https://github.com/DiscoCake/japanese-learning-lookup
