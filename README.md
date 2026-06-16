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
- **使い分け comparison** — a 2–3 member confusion family (e.g. 見る / 見える / 見せる), each member with a one-line "when to reach for this" and a short example
- Frequency / register note
- One Anki card hint capturing the key nuance

**Grammar mode** (auto-detected for patterns starting with ～/〜):
- What the pattern *actually* expresses beyond the textbook definition
- Formation rules + the most common learner mistake
- 4 example sentences: casual, standard, formal, and one tricky edge case
- Contrast with the most confused grammar pattern (minimal pair included)
- **使い分け comparison** — a 2–3 member pattern family (e.g. ～たら / ～ば / ～と), each with a one-line "when to reach for this" and a short example
- BunPro-specific tip for drilling

## Features

### Input & reading
- **Romaji→kana IME** (WanaKana) — type romaji, get kana; toggle off for the OS IME (off by default on touch devices)
- **Furigana on every kanji** with a global show/hide toggle; kanji highlighted cyan when furigana is on, reverting to the surrounding text color when off
- **Live mode-pill** — shows vocab vs grammar as you type, before submitting; click it to force the opposite mode (dashed border = manual override, cleared when you start typing)
- **Pitch accent display** — H/L overline contour badge next to the reading in vocab results; from the Kanjium dictionary (~124k entries) for known words, AI-generated fallback otherwise
- **Streaming responses** — cards appear progressively as tokens arrive; automatic fallback to non-streaming if the stream is interrupted

### Explanation modes
- **日本語モード (J-J mode)** — header toggle; all explanatory prose in JLPT N4–N5 Japanese, with English sentence translations kept as a safety net; J-J and J-E results cached separately
- **読む mode (paste mode)** — paste any Japanese text; the app identifies 5–12 N3-range words, explains each in context, and offers a bulk TSV export for the whole passage

### History & export
- **History** (last 50 lookups, persisted server-side in `data/history.json`) — click an entry to re-render from cache with no API re-call; doubles as a lookup cache so repeated searches skip the API; clicking moves an entry to the top
- **Search + filter** history by mode (単語/文法)
- **Copy buttons** per result: Anki TSV (HTML stripped) or raw JSON

### Audio
- **TTS playback (▶)** on every example sentence and on the word header (Web Speech API) — pause/resume; picks randomly from Enhanced/Premium/local Japanese voices for male/female balance

### Anki integration (AnkiConnect — desktop)
- **Ankiカード panel** (vocab mode) — shows the current sentence on your existing card and its deck, or a "no card" state with one-click creation into the Companion deck
- **→ Anki buttons** on every sentence (vocab + grammar) — two-click confirm (確定?, 3s auto-cancel) to replace the card's sentence or create a new card; auto-detects the sentence field across any note type
- **Grammar → Anki** — grammar lookups get a dedicated Companion Grammar note type (auto-created): Pattern, Meaning, Formation, Common Mistake, Sentence + Furigana + Meaning, BunPro tip
- **Card enrichment** — non-standard note types (any deck, not just Kaishi) get Companion fields added in-place (Reading, Meaning, Sentence, Sentence Meaning, Frequency, Notes) without touching review history
- **Kaishi 1.5k-style layout** — new Companion cards mirror Kaishi: word + highlighted sentence on the front; reading + pitch + meaning + furigana sentence + translation on the back, font sizes matched exactly (44/24/25/20px)
- **Built-in Anki TTS** — updated cards play word then sentence at review time; premium macOS voices used when `ANKI_TTS_VOICES` is set
- **苦手 panel** — cards with ≥2 lapses, filterable by deck; click any word to look it up instantly

### BunPro integration
- **文法苦手 panel** — troubled grammar from BunPro SRS; click a pattern to look it up; hidden automatically when `BUNPRO_TOKEN` is not set
- **BunPro SRS status card** — shown after each grammar lookup when the token is configured: SRS level, next review, streak, lapse count

### Mobile
- **PWA / home screen install** — manifest + standalone display; "Add to Home Screen" in Safari/Brave (iOS) or Chrome (Android); icon is an indigo square with a pink 語 kanji. See [Mobile / remote access](#mobile--remote-access-tailscale) for Tailscale setup.

See `CLAUDE.md` for architecture and design decisions.

## Mobile / remote access (Tailscale)

The server now binds to all interfaces (`0.0.0.0`), so any device on the same network or
Tailscale tailnet can reach it. Recommended setup for use on your phone while out:

1. **Install [Tailscale](https://tailscale.com/)** on the Mac and phone — sign both into the
   same account. Free for personal use.
2. **Start the server** on the Mac: `npm start` (or `npm run dev`).
   Keep the Mac awake: `caffeinate -s &` in another terminal during a study session.
3. **Open** `http://<mac-tailscale-hostname>:3001` in the phone's browser.
   Find your Mac's Tailscale hostname in the Tailscale app or at
   `tailscale status` → the `<name>.ts.net` entry. Bookmark it.

No port forwarding or public exposure needed — Tailscale is a private encrypted mesh.

**On mobile:**
- Touch targets are enlarged (~44px); the header buttons wrap on narrow screens.
- **Install as an app** — in Safari or Brave (iOS) or Chrome (Android), tap Share → "Add to Home Screen" for standalone mode with the app icon; tap once to look up, long-press the search field to paste from clipboard.
- The `苦手` and `文法苦手` panel buttons are hidden on mobile (AnkiConnect is desktop-only).
  TSV/JSON copy buttons still work via the system clipboard.
- The WanaKana romaji→kana IME starts **off** on touch devices — use the native Japanese
  keyboard. Tap `ローマ字` to enable it if you prefer romaji input.
- A per-IP rate limiter (default 30 lookups/min) is active on Claude-calling routes;
  configure via `RATE_LIMIT_PER_MIN` in `.env`.

## Development

```bash
npm run eval:check    # validate lookup output against saved snapshots (no API — the everyday gate)
npm run eval:update   # refresh ALL snapshots from live API after intentional prompt changes (costs $)
npm run eval:judge    # advisory: LLM-judge naturalness scores on snapshots (Opus; not a gate)
npm run test:smoke    # 10-check Playwright golden-path smoke test (server must be running)
```

The eval harness (`eval/`) guards the AI output — the most important thing in the app. After any edit to `src/lookup.js`, run `eval:check`. After deliberate prompt improvements, run `eval:update`, review the snapshot diff, then confirm `eval:check` passes. Never loosen a check to make it pass; fix the output instead.

**Cost note:** a full `eval:update` is ~28 live calls (output tokens dominate the bill). When iterating on a prompt, scope it with `-- --only <substr>` (e.g. `npm run eval:update -- --only grammar`) to regenerate just the cases you're tuning, and do a full regen only before committing. The same `--only` works for `eval:judge`. The advisory naturalness judge (`eval:judge`) uses `JUDGE_MODEL` (default `claude-opus-4-8`); it never affects the deterministic gate.

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
