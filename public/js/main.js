import { toggleFurigana, bindIME, toggleIME } from './furigana.js';
import { detectMode } from './render.js';
import {
  addToHistory, clearHistory,
  updateHistoryBadge, openHistoryPanel,
} from './history.js';
import { openAnkiPanel, initAnkiResultHandlers } from './anki.js';
import { openBunproPanel } from './bunpro.js';
import {
  getJJMode, setJJModeState, getCurrentResult,
  renderResult, doLookup, setAppMode, doPaste, initPasteResultHandlers,
} from './lookup-client.js';

/* ── FURIGANA ── */
document.getElementById('furigana-btn').onclick = toggleFurigana;

/* ── IME (WanaKana) ── */
const searchInput = document.getElementById('search-input');
bindIME(searchInput);
document.getElementById('ime-btn').onclick = function() { toggleIME(searchInput, this); };

/* ── J-J MODE ── */
function setJJ(on) {
  setJJModeState(on);
  document.querySelectorAll('#jj-btn .lang-opt').forEach(opt =>
    opt.classList.toggle('active', on ? opt.dataset.val === 'ja' : opt.dataset.val === 'en'));
  const result = getCurrentResult();
  if (result) {
    searchInput.value = result.input || result.word || result.pattern || '';
    doLookup();
  }
}
document.getElementById('jj-btn').onclick = () => setJJ(!getJJMode());
document.querySelectorAll('#jj-btn .lang-opt').forEach(opt =>
  opt.classList.toggle('active', getJJMode() ? opt.dataset.val === 'ja' : opt.dataset.val === 'en'));

/* ── LIVE MODE DETECTION ── */
searchInput.addEventListener('input', () => {
  const v = searchInput.value.trim();
  const ind = document.getElementById('mode-indicator');
  if (!v) { ind.style.display = 'none'; return; }
  const mode = detectMode(v);
  ind.textContent = mode === 'grammar' ? '文法' : '単語';
  ind.className = 'mode-pill ' + mode;
  ind.style.display = 'inline-block';
});
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) doLookup(); });
document.getElementById('search-btn').onclick = doLookup;

/* ── RESULT HANDLERS ── */
initAnkiResultHandlers(document.getElementById('result'), getCurrentResult);
initPasteResultHandlers();

/* ── HISTORY ── */
updateHistoryBadge();

function onHistorySelect(r) {
  addToHistory(r);
  renderResult(r);
  document.getElementById('history-panel').style.display = 'none';
  searchInput.value = r.input || '';
}

document.getElementById('history-btn').onclick = () => openHistoryPanel(onHistorySelect);
document.getElementById('history-close-btn').onclick = () => {
  document.getElementById('history-panel').style.display = 'none';
};
document.getElementById('history-clear-btn').onclick = () => {
  if (!confirm('履歴をすべて削除しますか？')) return;
  clearHistory();
  document.getElementById('history-panel').style.display = 'none';
};

/* ── FONT SIZE SCALER ── */
let scale = 1;
function setScale(v) {
  scale = Math.min(2.0, Math.max(0.5, Math.round(v * 10) / 10));
  document.documentElement.style.setProperty('--s', scale);
  document.getElementById('scale-label').textContent = Math.round(scale * 100) + '%';
}
document.getElementById('scale-up').onclick   = () => setScale(scale + 0.1);
document.getElementById('scale-down').onclick = () => setScale(scale - 0.1);
window.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); setScale(scale + (e.deltaY < 0 ? 0.1 : -0.1)); }
}, { passive: false });

/* ── ANKI STRUGGLING CARDS ── */
function onAnkiWordClick(word) {
  searchInput.value = word;
  doLookup();
}
document.getElementById('anki-btn').onclick = () => openAnkiPanel(onAnkiWordClick);
document.getElementById('anki-close-btn').onclick = () => {
  document.getElementById('anki-panel').style.display = 'none';
};
document.getElementById('anki-refresh-btn').onclick = () => openAnkiPanel(onAnkiWordClick);

/* ── BUNPRO ── */
function onBunproPatternClick(pattern) {
  searchInput.value = pattern;
  setAppMode('lookup');
  doLookup();
}

document.getElementById('bunpro-btn').style.display = 'none';
fetch('/api/bunpro/status').then(r => r.json()).then(d => {
  if (d.enabled) document.getElementById('bunpro-btn').style.display = '';
}).catch(() => {});

document.getElementById('bunpro-btn').onclick = () => openBunproPanel(onBunproPatternClick);
document.getElementById('bunpro-close-btn').onclick = () => {
  document.getElementById('bunpro-panel').style.display = 'none';
};
document.getElementById('bunpro-refresh-btn').onclick = () => openBunproPanel(onBunproPatternClick);

/* ── 読む MODE (PASTE) ── */
document.getElementById('tab-lookup').onclick = () => setAppMode('lookup');
document.getElementById('tab-paste').onclick  = () => setAppMode('paste');
document.getElementById('paste-submit-btn').onclick = doPaste;
