# Japanese Study Companion

Vocab and grammar deep-diver for N4→N3 learners. One word or grammar pattern in,
rich contextual breakdown out — multiple example sentences, register notes, confusion
traps, and one-click Anki TSV export.

## Stack

- **Backend**: Node.js + Express (proxy to Anthropic Claude API)
- **Frontend**: Vanilla JS, no build step — open `public/index.html` via the server
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`), single call per lookup
- **IME**: [WanaKana](https://wanakana.com/) for romaji→kana conversion

## Setup

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm start              # → http://localhost:3001
npm run dev            # same, with --watch (auto-restart on file changes)
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
- Live mode-pill — shows vocab vs grammar as you type before submitting
- History (last 50 lookups, persisted in localStorage) — click any entry to re-render from cache, no API re-call
- Copy buttons per result: Anki TSV (HTML stripped) or raw JSON
- Anki TSV export: per-result copy or full history bulk export

See `CLAUDE.md` for architecture and design decisions.

---

Sibling project: [東京奇譚](../tokyo-kitan/) — same visual palette and stack.
