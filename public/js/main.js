import { toggleFurigana, bindIME, toggleIME } from './furigana.js';
import { detectMode } from './render.js';
import {
  initHistory, addToHistory, clearHistory,
  updateHistoryBadge, openHistoryPanel,
} from './history.js';
import { openAnkiPanel, initAnkiResultHandlers } from './anki.js';
import { openBunproPanel } from './bunpro.js';
import {
  getJJMode, setJJModeState, getCurrentResult,
  renderResult, doLookup, setAppMode, doPaste, initPasteResultHandlers,
  getModeOverride, setModeOverride, clearModeOverride,
} from './lookup-client.js';

/* ── FURIGANA ── */
document.getElementById('furigana-btn').onclick = toggleFurigana;

/* ── IME (WanaKana) ── */
const searchInput = document.getElementById('search-input');
const imeBtn = document.getElementById('ime-btn');
// Off by default on touch devices — native JP IME handles kana; toggle still works
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
if (!isTouchDevice) {
  bindIME(searchInput);
  imeBtn.classList.add('active');
}
imeBtn.onclick = function() { toggleIME(searchInput, this); };

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

/* ── LIVE MODE DETECTION + OVERRIDE PILL ── */
function updateModePill(mode, manual = false) {
  const ind = document.getElementById('mode-indicator');
  ind.textContent = (mode === 'grammar' ? '文法' : '単語') + (manual ? ' ✎' : '');
  ind.className = 'mode-pill ' + mode + (manual ? ' manual' : '');
  ind.style.display = 'inline-block';
}

searchInput.addEventListener('input', () => {
  clearModeOverride();
  const v = searchInput.value.trim();
  const ind = document.getElementById('mode-indicator');
  if (!v) { ind.style.display = 'none'; return; }
  updateModePill(detectMode(v), false);
});

document.getElementById('mode-indicator').addEventListener('click', () => {
  const ind = document.getElementById('mode-indicator');
  if (ind.style.display === 'none') return;
  const current = getModeOverride() || (ind.classList.contains('grammar') ? 'grammar' : 'vocab');
  const next = current === 'grammar' ? 'vocab' : 'grammar';
  setModeOverride(next);
  updateModePill(next, true);
});

searchInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) doLookup(); });
document.getElementById('search-btn').onclick = doLookup;

/* ── CLIPBOARD PASTE BUTTON ── */
document.getElementById('paste-btn').onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) return;
    searchInput.value = text.trim();
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  } catch {
    // Clipboard API unavailable (HTTP on some mobile browsers) — focus input for native paste
    searchInput.focus();
  }
};

/* ── RESULT HANDLERS ── */
initAnkiResultHandlers(document.getElementById('result'), getCurrentResult);
initPasteResultHandlers();

/* ── HISTORY ── */
initHistory(); // loads from server, updates badge when ready

function onHistorySelect(r) {
  addToHistory(r);
  renderResult(r, { fromCache: true });
  document.getElementById('history-panel').style.display = 'none';
  searchInput.value = r.input || '';
}

/* ── RESULT REFRESH (cached results) ── */
document.getElementById('result').addEventListener('click', e => {
  const btn = e.target.closest('.refresh-btn');
  if (!btn) return;
  const r = getCurrentResult();
  if (!r) return;
  const label = r.input || r.word || r.pattern || '?';
  if (!confirm(`「${label}」を再生成しますか？\n（API を使用します）`)) return;
  doLookup({ force: true });
});

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
  clearModeOverride();
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
  clearModeOverride();
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
