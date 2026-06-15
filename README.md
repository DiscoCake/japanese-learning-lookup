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
- Live mode-pill — shows vocab vs grammar as you type before submitting; click the pill to force the opposite mode (dashed border = manual override; cleared when you start typing)
- **Pitch accent display** — H/L overline contour badge next to reading in vocab results; sourced from the Kanjium dictionary (~124k entries) for known words, AI-generated fallback for words not in the dictionary
- **日日モード (J-J mode)** — toggle in the header; all explanatory prose in JLPT N4–N5 Japanese; sentence translations stay in English as a safety net; J-J and J-E results cached separately
- Streaming responses — result cards appear progressively as tokens arrive; automatic fallback to non-streaming if stream is interrupted
- History (last 50 lookups, persisted in localStorage) — click any entry to re-render from cache, no API re-call; clicking moves it to the top; history doubles as a lookup cache so repeated searches skip the API entirely
- History search + filter by mode (単語/文法)
- Copy buttons per result: Anki TSV (HTML stripped) or raw JSON
- Anki TSV export: per-result copy or full history bulk export
- TTS playback (▶) on every example sentence via Web Speech API — pause/resume supported; picks randomly from Enhanced/Premium Japanese voices for a balance of male and female voices
- **読む mode** (paste mode) — paste any Japanese text; the app identifies 5–12 N3-range words, explains each in context, and offers a bulk TSV export for the whole passage
- **Ankiカード panel** (vocab mode) — shows the current sentence on your existing card and which deck it's in, or "no card" state with one-click creation into the Companion deck
- **→ Anki buttons** on every example sentence (vocab and grammar) — two-click confirm (確定?, 3s auto-cancel) to replace the card's sentence or create a new card; auto-detects the sentence field across any note type
- **Grammar → Anki** — grammar lookups get their own Companion Grammar note type (auto-created on first use); fields: Pattern, Meaning, Formation, Common Mistake, Sentence + Furigana + Meaning, BunPro tip
- **Card enrichment** — non-standard note types (any deck, not just Kaishi) get Companion fields added in-place (Reading, Meaning, Sentence, Sentence Meaning, Frequency, Notes) without touching review history
- **Kaishi 1.5k-style card layout** — new Companion cards mirror Kaishi: word + sentence (target word highlighted cyan) on front; reading + pitch + meaning + furigana sentence + translation on back; font sizes matched exactly to Kaishi (44/24/25/20px)
- **Built-in Anki TTS** — updated cards play word then sentence using system TTS at review time; premium macOS voices used when `ANKI_TTS_VOICES` is set
- **苦手 panel** — pulls cards with ≥2 lapses from AnkiConnect; filter by deck; click any word to look it up instantly
- **文法苦手 panel** (BunPro) — troubled grammar from BunPro SRS; click any pattern to look it up; button hidden automatically when `BUNPRO_TOKEN` is not set
- **BunPro SRS status card** — shown after every grammar lookup when token is configured; displays SRS level, next review time, streak, and lapse count

See `CLAUDE.md` for architecture and design decisions.

## Development

```bash
npm run eval:check    # validate lookup output against saved snapshots (no API — the everyday gate)
npm run eval:update   # refresh snapshots from live API after intentional prompt changes
npm run test:smoke    # 10-check Playwright golden-path smoke test (server must be running)
```

The eval harness (`eval/`) guards the AI output — the most important thing in the app. After any edit to `src/lookup.js`, run `eval:check`. After deliberate prompt improvements, run `eval:update`, review the snapshot diff, then confirm `eval:check` passes. Never loosen a check to make it pass; fix the output instead.

## Troubleshooting

**Anki features not working** (Ankiカード section and 苦手 panel show nothing):
- Make sure Anki is open before using the companion
- Confirm AnkiConnect add-on ([2055492159](https://ankiweb.net/shared/info/2055492159)) is installed and enabled (Anki → Tools → Add-ons)
- The server log will show `AnkiConnect error` if it can't reach `localhost:8765`

**BunPro features not showing** (文法苦手 button and grammar status cards are hidden):
- The `BUNPRO_TOKEN` in `.env` is a short-lived browser JWT — not the account API key (which is defunct)
- To refresh: open `bunpro.jp` while logged in → DevTools → Application → Local Storage → copy `frontend_api_token`
- Paste it as `BUNPRO_TOKEN=eyJ...` in `.env` and restart the server (`npm run dev`)
- Verify with `curl http://localhost:3001/api/bunpro/status` — should return `{"enabled":true}`

---

Sibling project: [東京奇譚](../tokyo-kitan/) — same visual palette and stack.

**Repo:** https://github.com/DiscoCake/japanese-learning-lookup
