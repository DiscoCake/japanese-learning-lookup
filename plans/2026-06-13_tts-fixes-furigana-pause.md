# Plan: TTS fixes — furigana double-read + pause/resume

## Context

Two bugs with the TTS feature added in the previous session:

1. **Double-reading furigana** — `jpEl.textContent` on a `<ruby>漢字<rt>かんじ</rt></ruby>` element returns "漢字かんじ", so the TTS speaks both the kanji and the furigana reading aloud. The fix (used in 東京奇譚 `tts.js`) is to clone the element, remove all `<rt>` nodes, then read `.textContent`.

2. **No pause** — the ▶ button starts speech but has no way to pause or stop it. The button should toggle between ▶ (idle/paused) and ⏸ (playing), with `speechSynthesis.pause()` / `speechSynthesis.resume()` for the active sentence and `speechSynthesis.cancel()` when switching to a different sentence.

---

## Fix 1 — Strip furigana before speaking

In the `#result` delegated click listener in [public/index.html](public/index.html), replace:
```js
speak(jpEl.textContent);
```
with:
```js
const clone = jpEl.cloneNode(true);
clone.querySelectorAll('rt').forEach(rt => rt.remove());
speak(clone.textContent, btn);
```

(Pattern taken directly from 東京奇譚 `tts.js` `sceneSpokenText()`, lines 25–30.)

---

## Fix 2 — Pause/resume toggle on each ▶ button

Replace the current `speak(text)` function with a stateful version that accepts the clicked button and handles play/pause/resume/switch:

```js
let activeSpeakBtn = null;

function speak(text, btn) {
  if (!window.speechSynthesis) return;

  // Same button clicked while playing → pause/resume toggle
  if (activeSpeakBtn === btn) {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      btn.textContent = '⏸';
    } else {
      speechSynthesis.pause();
      btn.textContent = '▶';
    }
    return;
  }

  // Different button (or no button active) → cancel current, start new
  if (activeSpeakBtn) activeSpeakBtn.textContent = '▶';
  speechSynthesis.cancel();
  activeSpeakBtn = btn;
  btn.textContent = '⏸';

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ja-JP';
  utt.rate = 0.9;
  utt.onend = () => { btn.textContent = '▶'; activeSpeakBtn = null; };

  const trySpeak = () => {
    const jaVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja'));
    if (jaVoice) utt.voice = jaVoice;
    speechSynthesis.speak(utt);
  };
  if (speechSynthesis.getVoices().length) trySpeak();
  else speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
}
```

`activeSpeakBtn` is a module-level variable. When a new lookup fires (`doLookup()`), `speechSynthesis.cancel()` at the start of any new `speak()` call naturally cleans up.

---

## Files to Modify

- [public/index.html](public/index.html) — `speak()` function + delegated listener (no server restart needed)
- [CLAUDE.md](CLAUDE.md) — changelog entry

---

## Verification

1. Look up 見る → click ▶ on sentence 1 → button changes to ⏸, speech plays in Japanese (kanji only, no furigana double-read)
2. Click ⏸ → speech pauses, button reverts to ▶
3. Click ▶ again → speech resumes from where it paused
4. Click ▶ on sentence 2 while sentence 1 is paused/playing → sentence 1 button reverts to ▶, sentence 2 starts
5. Let a sentence finish → button auto-reverts to ▶
