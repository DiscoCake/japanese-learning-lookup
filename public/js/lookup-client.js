import { speak } from './tts.js';
import { parsePartial, partialFieldCount, renderVocab, renderGrammar, renderError } from './render.js';
import { checkAnkiCard } from './anki.js';
import { checkBunproStatus } from './bunpro.js';
import { addToHistory, findInHistory } from './history.js';

let jjMode = localStorage.getItem('companion_jj_v1') === '1';
let currentResult = null;
let lookupAbortController = null;
let currentPasteResults = {};
let modeOverride = null; // 'vocab' | 'grammar' | null

export function getJJMode() { return jjMode; }
export function setJJModeState(on) {
  jjMode = on;
  localStorage.setItem('companion_jj_v1', on ? '1' : '0');
}
export function getCurrentResult() { return currentResult; }
export function getModeOverride() { return modeOverride; }
export function setModeOverride(mode) { modeOverride = mode; }
export function clearModeOverride() { modeOverride = null; }

export function renderResult(r, opts = {}) {
  currentResult = r;
  const el = document.getElementById('result');
  el.innerHTML = r.mode === 'vocab' ? renderVocab(r, opts) : renderGrammar(r, opts);
  el.style.display = 'block';
  el.classList.add('fadein');
  setTimeout(() => el.classList.remove('fadein'), 400);
  if (r.mode === 'vocab') checkAnkiCard(r);
  if (r.mode === 'grammar') checkBunproStatus(r);
}

export async function doLookup({ force = false } = {}) {
  const searchInput = document.getElementById('search-input');
  const input = searchInput.value.trim();
  if (!input) return;

  if (lookupAbortController) lookupAbortController.abort();
  const jjSnapshot = jjMode;

  const cached = !force && findInHistory(input, jjSnapshot);
  if (cached) { renderResult(cached, { fromCache: true }); return; }

  const controller = new AbortController();
  lookupAbortController = controller;

  document.getElementById('result').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('loading-text').innerHTML = `「${input}」を<ruby>調<rt>しら</rt></ruby>べています…`;

  try {
    const streamRes = await fetch('/api/lookup/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, jj: jjSnapshot, forceMode: modeOverride || undefined }),
      signal: controller.signal
    });
    if (!streamRes.ok) {
      const text = await streamRes.text();
      let msg; try { msg = JSON.parse(text).error; } catch {}
      throw new Error(msg || `HTTP ${streamRes.status}`);
    }

    const reader = streamRes.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let accumulated = '';
    let lastCount = 0;
    const resultEl = document.getElementById('result');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }
        if (evt.text) {
          accumulated += evt.text;
          const partial = parsePartial(accumulated);
          const count = partialFieldCount(partial);
          if (count > lastCount && (partial.mode || partial.word || partial.pattern)) {
            lastCount = count;
            resultEl.style.display = 'block';
            resultEl.innerHTML = partial.mode === 'grammar' ? renderGrammar(partial) : renderVocab(partial);
          }
        } else if (evt.done && evt.result) {
          evt.result.input = input;
          evt.result.jj = jjSnapshot;
          addToHistory(evt.result);
          renderResult(evt.result);
        } else if (evt.error) {
          throw new Error(evt.error);
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    renderError(e.message);
  }
  if (lookupAbortController === controller) {
    lookupAbortController = null;
    document.getElementById('loading').style.display = 'none';
  }
}

export function setAppMode(mode) {
  const isPaste = mode === 'paste';
  document.getElementById('tab-lookup').classList.toggle('active', !isPaste);
  document.getElementById('tab-paste').classList.toggle('active', isPaste);
  document.getElementById('search-row').style.display = isPaste ? 'none' : '';
  document.getElementById('search-hint').style.display = isPaste ? 'none' : '';
  document.getElementById('loading').style.display = 'none';
  document.getElementById('result').style.display = 'none';
  document.getElementById('paste-panel').style.display = isPaste ? 'block' : 'none';
  if (!isPaste) {
    document.getElementById('paste-results').innerHTML = '';
    currentPasteResults = {};
  }
}

export async function doPaste() {
  const text = document.getElementById('paste-input').value.trim();
  if (!text) return;

  const btn = document.getElementById('paste-submit-btn');
  const resultsEl = document.getElementById('paste-results');
  btn.disabled = true;
  btn.textContent = '解析中…';
  resultsEl.innerHTML = '';
  currentPasteResults = {};

  const wordIdx = {};

  try {
    const res = await fetch('/api/paste/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, jj: jjMode })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }

        if (evt.type === 'identified') {
          resultsEl.innerHTML = evt.words.map(({ word, reading, reason }, i) => {
            wordIdx[word] = i;
            return `<div class="paste-word-section" id="paste-slot-${i}">
              <div class="paste-placeholder">
                <div>
                  <div class="paste-placeholder-word">${word}</div>
                  ${reading ? `<div class="paste-placeholder-reading">【${reading}】</div>` : ''}
                  ${reason ? `<div style="font-size:0.7rem;color:var(--text3);margin-top:3px">${reason}</div>` : ''}
                </div>
                <div class="dots" style="margin-left:auto"><span></span><span></span><span></span></div>
              </div>
            </div>`;
          }).join('');

        } else if (evt.type === 'result') {
          currentPasteResults[evt.word] = evt.result;
          const i = wordIdx[evt.word];
          const slot = document.getElementById(`paste-slot-${i}`);
          if (slot) {
            const r = evt.result;
            const label = r.mode === 'grammar' ? (r.pattern || evt.word) : (r.word || evt.word);
            const reading = r.reading || '';
            slot.innerHTML = `
              <div class="paste-word-divider">${label}${reading ? ` 【${reading}】` : ''}</div>
              <div>${r.mode === 'grammar' ? renderGrammar(r, {compact:true}) : renderVocab(r, {compact:true})}</div>`;
          }

        } else if (evt.type === 'done') {
          if (Object.keys(currentPasteResults).length) {
            const bar = document.createElement('div');
            bar.id = 'paste-export-bar';
            bar.style.cssText = 'margin-top:1rem';
            bar.innerHTML = `<button class="ctrl-btn" id="paste-tsv-btn">全単語をAnkiにエクスポート (TSV)</button>`;
            resultsEl.appendChild(bar);
          }

        } else if (evt.type === 'error' && !evt.word) {
          resultsEl.innerHTML += `<div class="card"><div class="card-body" style="color:var(--pink)">エラー: ${evt.message}</div></div>`;
        }
      }
    }
  } catch (err) {
    resultsEl.innerHTML = `<div class="card"><div class="card-body" style="color:var(--pink)">エラー: ${err.message}</div></div>`;
  }

  btn.disabled = false;
  btn.textContent = '解析する';
}

// Sets up the delegated click handler for paste results (speak + bulk TSV).
// Called once from main during init; needs access to module-private currentPasteResults.
export function initPasteResultHandlers() {
  document.getElementById('paste-results').addEventListener('click', e => {
    const speakBtn = e.target.closest('.speak-btn');
    if (speakBtn) {
      const jpEl = speakBtn.closest('.sentence-item')?.querySelector('.sentence-jp');
      if (jpEl) {
        const clone = jpEl.cloneNode(true);
        clone.querySelectorAll('rt').forEach(rt => rt.remove());
        speak(clone.textContent, speakBtn);
      }
      return;
    }

    if (e.target.id === 'paste-tsv-btn') {
      const strip = s => s.replace(/<[^>]+>/g, '');
      const rows = Object.values(currentPasteResults).flatMap(r => {
        if (r.mode === 'vocab') {
          return (r.sentences || []).map(s => [r.word, r.reading, strip(s.jp), s.translation].join('\t'));
        }
        return (r.sentences || []).map(s => [r.pattern, '', strip(s.jp), s.translation].join('\t'));
      });
      navigator.clipboard.writeText(rows.join('\n')).then(() => {
        e.target.textContent = 'コピーしました！';
        setTimeout(() => { e.target.textContent = '全単語をAnkiにエクスポート (TSV)'; }, 2000);
      });
    }
  });
}
