# Plan: TTS Audio per sentence + History search/filter

## Context

Two new features:

1. **TTS audio** — the learner wants to hear example sentences spoken aloud. Web Speech API is already used in the sibling 東京奇譚 project. No audio code exists yet in this app. A ▶ play button on each sentence card is the natural surface.

2. **History search/filter** — the history panel currently shows all 50 entries with no way to find a specific one. Adding a search input and vocab/grammar mode filter pills mirrors the existing deck-filter pattern from the 苦手 panel.

---

## Feature 1 — TTS audio per example sentence

### Where

File: [public/index.html](public/index.html)

### Changes

**Add `speak(text)` function** in the `<script>` block:
```js
function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ja-JP';
  utt.rate = 0.9;
  const trySpeak = () => {
    const jaVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja'));
    if (jaVoice) utt.voice = jaVoice;
    speechSynthesis.speak(utt);
  };
  // getVoices() is async on first call in some browsers
  if (speechSynthesis.getVoices().length) trySpeak();
  else speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
}
```

**Add delegated click listener on `#result`** (one listener, not per-sentence):
```js
document.getElementById('result').addEventListener('click', e => {
  const btn = e.target.closest('.speak-btn');
  if (!btn) return;
  const jpEl = btn.closest('.sentence-item').querySelector('.sentence-jp');
  speak(jpEl.textContent); // .textContent auto-strips ruby/rt tags
});
```

**Add play button to sentence template** in both `renderVocab()` and `renderGrammar()`. In the `.sentence-item` template, add `<button class="speak-btn" title="読む">▶</button>` alongside the register-tag:
```js
<div class="sentence-item">
  <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.2rem">
    <span class="register-tag">${s.register}</span>
    <button class="speak-btn" title="読む">▶</button>
  </div>
  <div class="sentence-jp">${s.jp}</div>
  <div class="sentence-en">${s.translation}</div>
  ${s.notes ? `<div class="sentence-notes">↳ ${s.notes}</div>` : ''}
</div>
```

**Add `.speak-btn` CSS**:
```css
.speak-btn {
  background: none; border: 1px solid var(--border2); color: var(--text2);
  border-radius: 4px; padding: 0 0.4rem; font-size: 0.7rem; cursor: pointer;
  line-height: 1.6; transition: color 0.15s, border-color 0.15s;
}
.speak-btn:hover { color: var(--cyan); border-color: var(--cyan); }
```

---

## Feature 2 — History search + mode filter

### Where

File: [public/index.html](public/index.html) — `openHistoryPanel()` function and history panel HTML.

### Changes

**Modify `openHistoryPanel()`** to inject a search row above `#history-list`. After building entries, add a `keyup` listener on the search input and `click` listeners on the mode pills that call a local `filterHistory()`:

```js
// After panel.style.display = 'flex', before populating list:
const searchRow = document.createElement('div');
searchRow.innerHTML = `
  <input id="h-search" placeholder="検索…" style="width:100%;box-sizing:border-box;background:var(--card);border:1px solid var(--border2);color:var(--text);padding:0.4rem 0.6rem;border-radius:6px;font-size:0.85rem;margin-bottom:0.5rem">
  <div id="h-mode-pills" style="display:flex;gap:0.4rem;margin-bottom:0.75rem">
    <button class="deck-pill active" data-mode="all">全て</button>
    <button class="deck-pill" data-mode="vocab">単語</button>
    <button class="deck-pill" data-mode="grammar">文法</button>
  </div>`;
list.before(searchRow);
```

**`filterHistory(query, mode)`** — iterates `.history-entry` elements, shows/hides based on `data-word` and `data-mode`:
```js
function filterHistory(query, mode) {
  const q = query.toLowerCase();
  document.querySelectorAll('#history-list .history-entry').forEach(el => {
    const wordMatch = !q || el.dataset.word.toLowerCase().includes(q);
    const modeMatch = mode === 'all' || el.dataset.mode === mode;
    el.style.display = wordMatch && modeMatch ? '' : 'none';
  });
  const anyVisible = [...document.querySelectorAll('#history-list .history-entry')]
    .some(el => el.style.display !== 'none');
  document.getElementById('history-empty').style.display = anyVisible ? 'none' : '';
}
```

**Add `data-word` and `data-mode` attributes** to each `.history-entry` in `openHistoryPanel()`:
```js
entry.dataset.word = h.input;
entry.dataset.mode = h.mode;
```

**Wire up listeners** (inside openHistoryPanel after injecting searchRow):
```js
let hMode = 'all';
document.getElementById('h-search').addEventListener('input', e =>
  filterHistory(e.target.value, hMode));
document.getElementById('h-mode-pills').addEventListener('click', e => {
  const pill = e.target.closest('.deck-pill');
  if (!pill) return;
  hMode = pill.dataset.mode;
  document.querySelectorAll('#h-mode-pills .deck-pill').forEach(p =>
    p.classList.toggle('active', p === pill));
  filterHistory(document.getElementById('h-search').value, hMode);
});
```

The existing `.deck-pill` / `.deck-pill.active` CSS from the 苦手 panel covers styling — no new CSS needed.

---

---

## Pre-step — Archive the current plan

Before implementing, copy the active plan file to the repo's plan archive so past plans are preserved for reference:

```bash
mkdir -p "/Users/jasonalmerini/Library/Mobile Documents/com~apple~CloudDocs/VS Code Projects/companion/plans"
cp "/Users/jasonalmerini/.claude/plans/please-review-this-codebase-polymorphic-scone.md" \
   "/Users/jasonalmerini/Library/Mobile Documents/com~apple~CloudDocs/VS Code Projects/companion/plans/2026-06-13_tts-audio-history-search.md"
```

This establishes the `plans/` folder at the repo root as the running archive of all past planning sessions.

Also update **CLAUDE.md** to document this convention in a new "Plan archive" section alongside the existing "Archive conventions" section:

> Plans live as a single active file in `.claude/plans/`. Before overwriting it, copy it to `plans/YYYY-MM-DD_description.md` in the repo root so past plans are versioned and referenceable.

---

## Files to Modify

- [public/index.html](public/index.html) — all changes (static file, no server restart needed)
- [CLAUDE.md](CLAUDE.md) — plan archive convention + changelog entry
- `plans/` directory (new) — created by the pre-step above

---

## Verification

1. `plans/2026-06-13_tts-audio-history-search.md` exists in the repo
2. Look up any word → each example sentence shows a ▶ button; clicking it speaks the sentence in Japanese
3. Clicking ▶ while another sentence is playing cancels the first and starts the new one
4. Open history panel → search input and 全て/単語/文法 pills visible
5. Type in search → list filters live by input word
6. Click 単語 pill → only vocab entries shown; click 文法 → only grammar entries
