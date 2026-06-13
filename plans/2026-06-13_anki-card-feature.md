# Plan: Anki card sentence viewer + replacer

## Context

When the companion app returns example sentences for a word, the user may already have that word in their Kaishi 1.5k Anki deck with a single thin sentence. This feature lets them:
1. See the current Anki card sentence inline (without switching to Anki)
2. Replace it with any companion example sentence in one click

**Kaishi 1.5k field schema** (confirmed via research):
- `Word` — the vocab word (matches what we search by)
- `Sentence` — the example sentence (plain text)
- `Sentence Meaning` — English translation
- `Sentence Furigana` — reading annotation
- `Sentence Audio` — `[sound:filename.mp3]` tag

**Audio**: Kaishi's sentence audio is human-recorded. For **new cards** (separate deck), we generate sentence audio via **VoiceVox** (local TTS at `http://localhost:50021`) — POST `/audio_query?text=TEXT&speaker=1`, then POST `/synthesis?speaker=1` → WAV binary → base64 → AnkiConnect `storeMediaFile` → embed `[sound:filename.wav]` in `Sentence Audio`. For **existing card sentence replacements**, we also regenerate audio via VoiceVox if it's running; otherwise clear the field. Word audio is never touched.

**Deck split**:
- **Existing cards** (找 in Kaishi) → update in-place in whatever deck they live in
- **New cards** → go to a separate deck, default `"Companion"`, configurable via `ANKI_COMPANION_DECK` in `.env`

**Two modes:**
- **Card exists** → show current sentence, offer to replace it with any companion sentence
- **No card exists** → offer to create a new note in the user's Anki deck matching Kaishi 1.5k's full field schema

**AnkiConnect actions used:**
- `findNotes` — `{ query: "Word:見る" }` → note IDs
- `notesInfo` — `{ notes: [id] }` → full field values
- `updateNoteFields` — `{ note: { id, fields: { Sentence, "Sentence Meaning", "Sentence Audio" } } }`
- `addNote` — create a new note when none exists
- `deckNames` — fetch available deck names for the deck selector UI

**Anki furigana notation**: Kaishi stores furigana as `漢字[かんじ]` in the `Word Furigana` and `Sentence Furigana` fields. We convert Claude's ruby HTML to this format with a simple regex:
```js
function rubyToAnkiFurigana(html) {
  return html
    .replace(/<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g, '$1[$2]')
    .replace(/<[^>]+>/g, '');
}
```

**Deck and model names**:
- New cards: `deckName` = `ANKI_COMPANION_DECK` env var (default `"Companion"`), `modelName` = `"Kaishi 1.5k"` (reuse the same note type so all fields match — no new note type needed)
- Existing cards: updated in their current deck (deck name comes from `notesInfo` response)

---

## Backend — `src/anki.js`

Add exported functions:

```js
const SENTENCE_KEYS = ['Sentence', 'Example Sentence', 'Example', 'Context', 'Usage'];
const SENTENCE_MEANING_KEYS = ['Sentence Meaning', 'Sentence English', 'Translation', 'Meaning'];
const SENTENCE_AUDIO_KEYS = ['Sentence Audio', 'SentenceAudio', 'Audio Sentence'];

async function findNoteForWord(word) {
  // Try exact word match first, then broader search
  let noteIds = await ankiRequest('findNotes', { query: `Word:"${word}"` });
  if (!noteIds?.length) noteIds = await ankiRequest('findNotes', { query: `"${word}"` });
  if (!noteIds?.length) return null;

  const notes = await ankiRequest('notesInfo', { notes: [noteIds[0]] });
  const note = notes?.[0];
  if (!note) return null;

  const fields = note.fields || {};
  let sentence = '', sentenceMeaning = '', sentenceAudioKey = '';

  for (const k of SENTENCE_KEYS) {
    if (fields[k]?.value) { sentence = stripHtml(fields[k].value); break; }
  }
  for (const k of SENTENCE_MEANING_KEYS) {
    if (fields[k]?.value) { sentenceMeaning = stripHtml(fields[k].value); break; }
  }
  for (const k of SENTENCE_AUDIO_KEYS) {
    if (fields[k] !== undefined) { sentenceAudioKey = k; break; }
  }

  return {
    noteId: note.noteId,
    deckName: note.tags?.join(', ') || '',
    sentence,
    sentenceMeaning,
    sentenceAudioKey,
    allFields: Object.keys(fields)   // useful for debugging
  };
}

async function updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey) {
  const fields = {};
  fields[sentenceFieldKey] = sentence;
  if (sentenceMeaningKey && sentenceMeaning) fields[sentenceMeaningKey] = sentenceMeaning;
  if (sentenceAudioKey) fields[sentenceAudioKey] = '';   // clear stale audio
  await ankiRequest('updateNoteFields', { note: { id: noteId, fields } });
}

module.exports = { getStrugglingCards, findNoteForWord, updateCardSentence };
```

Note: `findNoteForWord` also needs to track which actual field key matched (to know what to pass to `updateNoteFields`). Adjust the loop to capture the matched key names alongside the value.

**Card creation** — `addNoteForWord(result, sentence)`:
```js
async function addNoteForWord(result, sentence) {
  const deckName = process.env.ANKI_COMPANION_DECK || 'Companion';  // separate deck
  const modelName = 'Kaishi 1.5k';                                   // reuse Kaishi note type
  const jpPlain = stripHtml(sentence.jp);
  const jpFurigana = rubyToAnkiFurigana(sentence.jp);
  const wordFurigana = rubyToAnkiFurigana(result.word);

  // Try VoiceVox for sentence audio; fall back to empty
  let sentenceAudioTag = '';
  try {
    const filename = `companion_${Date.now()}.wav`;
    const base64 = await generateSentenceAudio(jpPlain);
    sentenceAudioTag = await storeAudioAndGetTag(filename, base64);
  } catch { /* VoiceVox not running — skip audio */ }

  return ankiRequest('addNote', {
    note: {
      deckName,
      modelName,
      fields: {
        'Word': stripHtml(result.word),
        'Word Reading': result.reading || '',
        'Word Furigana': wordFurigana,
        'Word Meaning': stripHtml(result.core_meaning || ''),
        'Word Audio': '',
        'Sentence': jpPlain,
        'Sentence Meaning': sentence.translation || '',
        'Sentence Furigana': jpFurigana,
        'Sentence Audio': sentenceAudioTag,
        'Frequency': stripHtml(result.frequency || ''),
        'Notes': stripHtml(result.anki_hint || ''),
      },
      options: { allowDuplicate: false, duplicateScope: 'deck' },
      tags: ['companion']
    }
  });
}
```

Also add `getDeckNames()` to fetch available decks for the frontend selector:
```js
async function getDeckNames() {
  return ankiRequest('deckNames');
}
```

**VoiceVox audio generation** — `generateSentenceAudio(text)`:
```js
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const VOICEVOX_SPEAKER = parseInt(process.env.VOICEVOX_SPEAKER || '1');

async function generateSentenceAudio(text) {
  // Step 1: get audio query
  const queryRes = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${VOICEVOX_SPEAKER}`,
    { method: 'POST' }
  );
  if (!queryRes.ok) throw new Error('VoiceVox audio_query failed');
  const query = await queryRes.json();

  // Step 2: synthesize WAV
  const synthRes = await fetch(
    `${VOICEVOX_URL}/synthesis?speaker=${VOICEVOX_SPEAKER}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }
  );
  if (!synthRes.ok) throw new Error('VoiceVox synthesis failed');
  const wavBuffer = await synthRes.arrayBuffer();
  return Buffer.from(wavBuffer).toString('base64');
}
```

**`storeAudioAndGetTag(filename, base64wav)`** — stores file via AnkiConnect, returns `[sound:filename]`:
```js
async function storeAudioAndGetTag(filename, base64wav) {
  await ankiRequest('storeMediaFile', { filename, data: base64wav });
  return `[sound:${filename}]`;
}
```

Both functions are called inside `addNoteForWord` and `updateCardSentence` with a try/catch — if VoiceVox isn't running, audio is set to `''` instead of failing the whole operation.

Export: `module.exports = { getStrugglingCards, findNoteForWord, updateCardSentence, addNoteForWord, getDeckNames };`

---

## Backend — `src/server.js`

New routes:

```js
// GET /api/anki/card?word=見る
app.get('/api/anki/card', async (req, res) => {
  const { word } = req.query;
  if (!word) return res.status(400).json({ error: 'word required' });
  try {
    const note = await findNoteForWord(word.trim());
    if (!note) return res.json({ found: false });
    res.json({ found: true, ...note });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/anki/card/sentence  — replace sentence on existing note
app.post('/api/anki/card/sentence', async (req, res) => {
  const { noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey } = req.body;
  if (!noteId || !sentenceFieldKey || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    await updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey);
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/anki/card/create  — create new note { result, sentence }
app.post('/api/anki/card/create', async (req, res) => {
  const { result, sentence } = req.body;
  if (!result || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    const noteId = await addNoteForWord(result, sentence);
    res.json({ ok: true, noteId });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/anki/decks  — list available deck names
app.get('/api/anki/decks', async (req, res) => {
  try {
    const decks = await getDeckNames();
    res.json({ decks });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});
```

---

## Frontend — `public/index.html`

After `renderResult()` for **vocab mode only**, call `/api/anki/card?word=...` and inject an Anki card section into `#result`.

**Two states of the Anki card section:**

*Card exists* — show current sentence + "→ Anki" replace buttons on each example sentence:
```
┌─ Ankiカード ────────────────────────────────┐
│ 現在の例文                                   │
│ 毎日テレビを見る。                           │
│ I watch TV every day.                       │
│ ↓ 下の例文ボタンで置き換えられます（音声はクリアされます）│
└──────────────────────────────────────────────┘
```

*No card exists* — show a "カードを作成" button. Clicking it opens a small inline form: choose which example sentence to use (shows a dropdown or just uses the first sentence), then "作成" creates the note:
```
┌─ Ankiカード ────────────────────────────────┐
│ このデッキにカードがありません              │
│ [+ Ankiに追加] ← button                    │
└──────────────────────────────────────────────┘
```
Clicking "→ Anki" on a sentence in the no-card state creates a new note using that sentence (same as replace buttons but calls `/api/anki/card/create`).

**"→ Anki" button** in `renderVocab()` sentence template (hidden by default, revealed after API response):
```js
<button class="anki-send-btn" style="display:none" title="Ankiへ送る">→ Anki</button>
```

**`checkAnkiCard(result)` function** (called from `renderResult()` for vocab mode):
```js
async function checkAnkiCard(result) {
  const section = document.getElementById('anki-card-section');
  if (!section) return;
  currentAnkiNote = null;
  section.style.display = 'none';

  let data;
  try {
    const res = await fetch(`/api/anki/card?word=${encodeURIComponent(result.word || result.input)}`);
    data = await res.json();
  } catch { return; }   // Anki not open — silent fail

  section.style.display = '';
  const sentenceEl = document.getElementById('anki-current-sentence');
  const meaningEl = document.getElementById('anki-current-meaning');
  const statusEl = document.getElementById('anki-card-status');

  if (data.found) {
    currentAnkiNote = data;
    sentenceEl.textContent = data.sentence || '(例文なし)';
    meaningEl.textContent = data.sentenceMeaning || '';
    statusEl.textContent = '↓ 下の例文で置き換えられます（音声はクリアされます）';
    document.querySelectorAll('.anki-send-btn').forEach(btn => {
      btn.style.display = ''; btn.title = 'Ankiの例文を置き換える';
    });
  } else {
    sentenceEl.textContent = 'このデッキにカードがありません';
    meaningEl.textContent = '';
    statusEl.textContent = '↓ 例文ボタンでカードを新規作成';
    document.querySelectorAll('.anki-send-btn').forEach(btn => {
      btn.style.display = ''; btn.title = 'Ankiにカードを追加';
    });
  }
}
```

**Delegated handler** (inside the existing `#result` click listener):
```js
if (e.target.classList.contains('anki-send-btn')) {
  const item = e.target.closest('.sentence-item');
  const clone = item.querySelector('.sentence-jp').cloneNode(true);
  clone.querySelectorAll('rt').forEach(rt => rt.remove());
  const jpText = clone.textContent;
  const enText = item.querySelector('.sentence-en')?.textContent || '';

  if (currentAnkiNote) {
    // Replace existing
    await fetch('/api/anki/card/sentence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: currentAnkiNote.noteId, sentenceFieldKey: currentAnkiNote.sentenceFieldKey,
        sentence: jpText, sentenceMeaning: enText, sentenceMeaningKey: currentAnkiNote.sentenceMeaningKey,
        sentenceAudioKey: currentAnkiNote.sentenceAudioKey })
    });
    document.getElementById('anki-current-sentence').textContent = jpText;
    document.getElementById('anki-current-meaning').textContent = enText;
  } else {
    // Create new note
    const sentenceObj = { jp: item.querySelector('.sentence-jp').innerHTML, translation: enText };
    await fetch('/api/anki/card/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: currentResult, sentence: sentenceObj })
    });
    // Reload the card info to show the newly created note
    await checkAnkiCard(currentResult);
  }
  e.target.textContent = '✓';
  setTimeout(() => e.target.textContent = '→ Anki', 2000);
}
```

---

## Files to Modify

- [src/anki.js](src/anki.js) — `findNoteForWord`, `updateCardSentence`, update `module.exports`
- [src/server.js](src/server.js) — two new routes; import new functions
- [public/index.html](public/index.html) — `checkAnkiCard()`, replace button in `renderVocab()`, delegated handler, Anki card section HTML
- [CLAUDE.md](CLAUDE.md) — changelog entry

---

## Files to Modify

- [src/anki.js](src/anki.js) — `findNoteForWord`, `updateCardSentence`, `addNoteForWord`, `getDeckNames`, `rubyToAnkiFurigana`; update `module.exports`
- [src/server.js](src/server.js) — 4 new routes; import new functions
- [public/index.html](public/index.html) — `checkAnkiCard()`, `anki-send-btn` in `renderVocab()`, delegated handler, Anki card section HTML block
- [CLAUDE.md](CLAUDE.md) — changelog entry

---

## `.env` additions

```
ANKI_COMPANION_DECK=Companion     # deck name for new cards (default: Companion)
VOICEVOX_URL=http://localhost:50021
VOICEVOX_SPEAKER=1                # speaker ID (1 = Zundamon normal)
```

---

## Verification

1. **Card exists (Kaishi)**: Look up 見る → Ankiカード section shows current Kaishi sentence; click "→ Anki" → sentence replaced; open Anki — `Sentence` updated, if VoiceVox running `Sentence Audio` has new `[sound:companion_*.wav]`
2. **No card**: Look up a word not in Kaishi → section shows "カードがありません"; click "→ Anki" → new note created in "Companion" deck using Kaishi 1.5k note type; all fields populated; VoiceVox audio on `Sentence Audio` if available
3. **VoiceVox not running**: Both create and replace still work — audio field is left empty, no error shown to user
4. **Anki closed**: Card section stays hidden; no JS errors (503 silently caught)
5. **Grammar mode**: Look up ～てしまう → no Ankiカード section rendered
