let activeSpeakBtn = null;
let ttsVoiceIndex = 0;

export function speak(text, btn) {
  if (!window.speechSynthesis) return;

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

  if (activeSpeakBtn) activeSpeakBtn.textContent = '▶';
  speechSynthesis.cancel();
  activeSpeakBtn = btn;
  btn.textContent = '⏸';

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ja-JP';
  utt.rate = 0.9;
  utt.onend = () => { btn.textContent = '▶'; activeSpeakBtn = null; };

  const trySpeak = () => {
    const jaVoices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('ja'));
    // Prefer macOS 'Enhanced'/'Premium' labels; fall back to locally-installed voices
    // (localService:true) which catches downloaded iOS voices that lack those labels.
    const enhanced = jaVoices.filter(v => v.name.includes('Enhanced') || v.name.includes('Premium'));
    const pool = enhanced.length ? enhanced : (jaVoices.filter(v => v.localService) || jaVoices);
    if (pool.length) utt.voice = pool[ttsVoiceIndex++ % pool.length];
    speechSynthesis.speak(utt);
  };
  // Chrome/macOS bug: speak() right after cancel() silently fails; 50ms delay flushes it
  const doSpeak = () => {
    if (speechSynthesis.getVoices().length) trySpeak();
    else speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
  };
  setTimeout(doSpeak, 50);
}
