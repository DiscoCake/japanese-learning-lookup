# Plan: Anki update completeness + history UX

## Context

Three issues surfaced after the PR was merged:

1. **Anki existing card update misses new fields.** `updateCardSentence` and `enrichAndUpdateCard` only write the plain `Sentence` field. When you push a sentence to a card that already exists (Companion or enriched Kaishi), `Sentence Highlighted` (word bold/cyan) and `Sentence Furigana` (Anki furigana notation) are left as they were when the card was originally created. New cards via `addNoteForWord` already write all fields correctly — this gap is update-only.

2. **History panel has a bulk TSV export button the user doesn't use.** Remove it.

3. **History items can't be individually deleted.** Add a per-item ✕ delete button with a confirm dialog. (The existing bulk "clear all" already has `confirm()` — no change needed there.)

---

## 1. Anki: write Sentence Highlighted + Sentence Furigana on update

### `src/anki.js`

**`updateCardSentence`** — add `word` and `sentenceHtml` params at the end. After building the base fields object, fetch `modelFieldNames` for the model and conditionally write the two Companion layout fields:

```js
async function updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning,
    sentenceMeaningKey, sentenceAudioKey, modelName, word, sentenceHtml) {
  ...
  if (modelName && (word || sentenceHtml)) {
    try {
      const existing = new Set(await ankiRequest('modelFieldNames', { modelName }));
      if (word && existing.has('Sentence Highlighted'))
        fields['Sentence Highlighted'] = highlightWordInSentence(sentence, word);
      if (sentenceHtml && existing.has('Sentence Furigana'))
        fields['Sentence Furigana'] = rubyToAnkiFurigana(sentenceHtml);
    } catch { /* best-effort */ }
  }
  await ankiRequest('updateNoteFields', ...);
  ...
}
```

**`COMPANION_FIELDS`** — extend to include the two new fields so `enrichNoteType` adds them to non-standard cards during enrichment:

```js
const COMPANION_FIELDS = ['Reading', 'Meaning', 'Sentence', 'Sentence Highlighted',
  'Sentence Furigana', 'Sentence Meaning', 'Frequency', 'Notes'];
```

**`enrichAndUpdateCard`** — add `sentenceHtml` param; write `Sentence Highlighted` and `Sentence Furigana` in the fields object:

```js
async function enrichAndUpdateCard(noteId, modelName, result, jpPlain, translation, sentenceHtml) {
  await enrichNoteType(modelName, COMPANION_FIELDS);
  const word = stripHtml(result.word || '');
  const fields = {
    ...existing fields...
    'Sentence Highlighted': word ? highlightWordInSentence(jpPlain, word) : jpPlain,
    'Sentence Furigana': sentenceHtml ? rubyToAnkiFurigana(sentenceHtml) : jpPlain,
  };
  ...
}
```

### `src/server.js`

- `POST /api/anki/card/sentence`: destructure `word` and `sentenceHtml` from body; pass to `updateCardSentence`
- `POST /api/anki/card/enrich`: pass `sentence.html` as the new `sentenceHtml` arg to `enrichAndUpdateCard`

### `public/index.html` — send handler

- `/api/anki/card/sentence` body: add `word: currentResult.word || currentResult.input` and `sentenceHtml: jpHtml`
- `/api/anki/card/enrich` body: change `sentence: { jp: jpText, translation: enText }` → `sentence: { jp: jpText, translation: enText, html: jpHtml }`

---

## 2. Remove bulk history TSV export

**HTML**: remove the `<button ... id="history-export-btn">` from `.panel-actions` in the history panel.

**JS**: remove the `document.getElementById('history-export-btn').onclick` handler (~6 lines).

---

## 3. Per-item history delete

### CSS

Add to the `<style>` block:
```css
.h-del-btn {
  background: none; border: none; color: var(--text3); cursor: pointer;
  font-size: 0.75rem; padding: 0.2rem 0.4rem; border-radius: 4px;
  opacity: 0; transition: opacity 0.12s, color 0.12s; margin-left: auto;
  flex-shrink: 0;
}
.history-entry:hover .h-del-btn { opacity: 1; }
.h-del-btn:hover { color: var(--pink); }
```

Note: `margin-left: auto` on the delete button pushes it right; the existing `.h-time` timestamp also has `margin-left: auto` and will need to be removed from `h-time` or the layout adjusted. Simplest: keep `h-time` without `margin-left: auto`, place the delete button as the last child.

### `openHistoryPanel()` — entry building

Inside the history entry construction, add the delete button and wire its click:

```js
const delBtn = document.createElement('button');
delBtn.className = 'h-del-btn';
delBtn.textContent = '✕';
delBtn.title = '削除';
delBtn.onclick = e => {
  e.stopPropagation();
  if (!confirm(`「${label}」を履歴から削除しますか？`)) return;
  history = history.filter(h => !(h.input === r.input && !!h.jj === !!r.jj));
  saveHistory();
  updateHistoryBadge();
  d.remove();
  if (!document.querySelectorAll('#history-list .history-entry').length)
    document.getElementById('history-empty').style.display = '';
};
d.appendChild(delBtn);
```

The existing `d.onclick` handler stays on the container — `e.stopPropagation()` in the delete handler ensures the entry's click-to-render doesn't also fire.

---

## Files changed

- `src/anki.js` — `updateCardSentence`, `COMPANION_FIELDS`, `enrichAndUpdateCard`
- `src/server.js` — two route handlers
- `public/index.html` — send handler, history panel HTML, history panel JS, CSS

## Verification

1. Look up a word → push a sentence to an existing Companion card → open Anki, check the card's `Sentence Highlighted` and `Sentence Furigana` fields updated alongside `Sentence`
2. Look up a word → push a sentence to a non-Companion (enrichment path) card → same check
3. Open 履歴 panel → bulk export button is gone
4. Open 履歴 panel → hover a row → ✕ appears → click ✕ → confirm dialog → item removed from list and localStorage; cancel → item stays
5. 履歴 を削除 still shows confirm; accept → panel closes, list cleared
