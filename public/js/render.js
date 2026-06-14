/* ── PARTIAL JSON PARSING (progressive render while streaming) ── */
function unescJson(s) {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '');
}
function extractStr(text, field) {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? unescJson(m[1]) : undefined;
}
function parseObjAt(text, start) {
  let depth = 0, inStr = false, esc = false, i = start;
  while (i < text.length) {
    const c = text[i];
    if (esc) { esc = false; }
    else if (c === '\\' && inStr) { esc = true; }
    else if (c === '"') { inStr = !inStr; }
    else if (!inStr) {
      if (c === '{') depth++;
      else if (c === '}') { if (--depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return undefined; } } }
    }
    i++;
  }
  return undefined;
}
function advPast(text, start) {
  let depth = 0, inStr = false, esc = false, i = start;
  while (i < text.length) {
    const c = text[i];
    if (esc) { esc = false; } else if (c === '\\' && inStr) { esc = true; }
    else if (c === '"') { inStr = !inStr; }
    else if (!inStr) { if (c === '{') depth++; else if (c === '}') { if (--depth === 0) return i + 1; } }
    i++;
  }
  return i;
}
function extractObj(text, field) {
  const idx = text.indexOf(`"${field}"`); if (idx === -1) return undefined;
  const brace = text.indexOf('{', idx); if (brace === -1) return undefined;
  return parseObjAt(text, brace);
}
function extractArr(text, field) {
  const idx = text.indexOf(`"${field}"`); if (idx === -1) return [];
  const bracket = text.indexOf('[', idx); if (bracket === -1) return [];
  const items = []; let i = bracket + 1;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (text[i] === ']' || i >= text.length) break;
    if (text[i] !== '{') { i++; continue; }
    const obj = parseObjAt(text, i); if (obj === undefined) break;
    items.push(obj); i = advPast(text, i);
  }
  return items;
}

export function parsePartial(text) {
  const r = {};
  const mode = extractStr(text, 'mode'); if (mode) r.mode = mode;
  for (const f of ['word','reading','core_meaning','dont_use','frequency','anki_hint','pattern','real_meaning','bunpro_tip']) {
    const v = extractStr(text, f); if (v !== undefined) r[f] = v;
  }
  r.sentences = extractArr(text, 'sentences');
  r.confused_with = extractObj(text, 'confused_with');
  r.formation = extractObj(text, 'formation');
  r.pitch_accent = extractObj(text, 'pitch_accent');
  return r;
}

export function partialFieldCount(p) {
  return Object.keys(p).filter(k => {
    const v = p[k];
    return v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
  }).length + (p.sentences?.length || 0);
}

export function detectMode(input) {
  const t = input.trim();
  if (/^[～〜]/.test(t) || t.includes('〜') || t.includes('～')) return 'grammar';
  if (/^[ぁ-ん]{3,}$/.test(t)) return 'grammar';
  return 'vocab';
}

/* ── PITCH ACCENT DISPLAY ── */
export function formatPitchDisplay(reading, pitchAccent) {
  if (!pitchAccent || !reading) return '';
  const n = pitchAccent.number;
  const smalls = new Set('ゃゅょぁぃぅぇぉャュョァィゥェォ');
  const morae = [];
  for (let i = 0; i < reading.length; i++) {
    if (i + 1 < reading.length && smalls.has(reading[i + 1])) {
      morae.push(reading[i] + reading[i + 1]); i++;
    } else {
      morae.push(reading[i]);
    }
  }
  const isHigh = (i) => {
    if (n === 0) return i > 0;
    if (n === 1) return i === 0;
    return i > 0 && i < n;
  };
  const dropIdx = n === 0 ? -1 : n - 1;
  const spans = morae.map((m, i) => {
    if (i === dropIdx) return `<span class="pd">${m}</span>`;
    return isHigh(i) ? `<span class="ph">${m}</span>` : `<span class="pl">${m}</span>`;
  }).join('');
  return `<span class="pitch-display">${spans}</span>`;
}

/* ── VOCAB RENDER ── */
export function renderVocab(r, opts = {}) {
  return `
    <div class="result-header">
      <span class="result-word">${r.word || '…'}</span>
      ${r.reading ? `<span class="result-reading">【${r.pitch_accent ? formatPitchDisplay(r.reading, r.pitch_accent) : r.reading}】</span>` : ''}
      <span class="mode-pill vocab">単語</span>
    </div>

    ${r.core_meaning ? `
    <div class="card">
      <div class="card-label">意味・ニュアンス</div>
      <div class="card-body">${r.core_meaning}</div>
    </div>` : ''}

    ${r.sentences && r.sentences.length ? `
    <div class="card">
      <div class="card-label">例文 (${r.sentences.length})</div>
      <div class="sentence-list">
        ${r.sentences.map(s => `
          <div class="sentence-item">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.2rem">
              <span class="register-tag">${s.register}</span>
              <button class="speak-btn" title="読む">▶</button>
              ${!opts.compact ? `<button class="anki-send-btn" style="display:none" title="Ankiへ送る">→ Anki</button>` : ''}
            </div>
            <div class="sentence-jp">${s.jp}</div>
            <div class="sentence-en">${s.translation}</div>
            ${s.notes ? `<div class="sentence-notes">↳ ${s.notes}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${!opts.compact ? `
    <div class="card" id="anki-card-section" style="display:none">
      <div class="card-label">Ankiカード</div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
          <span style="font-size:0.78rem;color:var(--text3)">現在の例文</span>
          <span id="anki-deck-name" class="register-tag" style="display:none"></span>
        </div>
        <div id="anki-current-sentence" style="font-family:'Noto Serif JP',serif;font-size:0.95rem;color:var(--text);margin-bottom:0.3rem;line-height:1.8"></div>
        <div id="anki-current-meaning" style="font-size:0.8rem;color:var(--text2);margin-bottom:0.5rem"></div>
        <div id="anki-card-status" style="font-size:0.72rem;color:var(--text3)"></div>
      </div>
    </div>` : ''}

    ${r.dont_use ? `
    <div class="card">
      <div class="card-label">使わないほうがいい場合</div>
      <div class="card-body">${r.dont_use}</div>
    </div>` : ''}

    ${r.confused_with ? `
    <div class="card">
      <div class="card-label">混同しやすい表現</div>
      <div class="contrast-word">${r.confused_with.word}</div>
      <div class="card-body">${r.confused_with.contrast}</div>
    </div>` : ''}

    ${r.frequency ? `
    <div class="card">
      <div class="card-label">使用頻度・レジスター</div>
      <div class="card-body">${r.frequency}</div>
    </div>` : ''}

    ${r.anki_hint ? `
    <div class="card">
      <div class="card-label">Ankiヒント</div>
      <div class="card-body">${r.anki_hint}</div>
    </div>` : ''}

    ${!opts.compact ? exportBar() : ''}`;
}

/* ── GRAMMAR RENDER ── */
export function renderGrammar(r, opts = {}) {
  return `
    <div class="result-header">
      <span class="result-word" style="font-size:1.5rem">${r.pattern || '…'}</span>
      <span class="mode-pill grammar">文法</span>
    </div>

    ${r.real_meaning ? `
    <div class="card">
      <div class="card-label">本当の意味・ニュアンス</div>
      <div class="card-body">${r.real_meaning}</div>
    </div>` : ''}

    ${!opts.compact ? `
    <div class="card" id="bunpro-status-section" style="display:none">
      <div class="card-label">BunProステータス</div>
      <div class="card-body" id="bunpro-status-body"></div>
    </div>` : ''}

    ${r.formation ? `
    <div class="card">
      <div class="card-label">接続形</div>
      <div class="card-body formation-rule">${r.formation.rule}</div>
      <div class="formation-mistake">${r.formation.common_mistake}</div>
    </div>` : ''}

    ${r.sentences && r.sentences.length ? `
    <div class="card">
      <div class="card-label">例文 (${r.sentences.length})</div>
      <div class="sentence-list">
        ${r.sentences.map(s => `
          <div class="sentence-item">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.2rem">
              <span class="register-tag">${s.register}</span>
              <button class="speak-btn" title="読む">▶</button>
            </div>
            <div class="sentence-jp">${s.jp}</div>
            <div class="sentence-en">${s.translation}</div>
            ${s.notes ? `<div class="sentence-notes">↳ ${s.notes}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${r.confused_with ? `
    <div class="card">
      <div class="card-label">混同しやすい文法</div>
      <div class="contrast-word">${r.confused_with.pattern}</div>
      <div class="card-body">${r.confused_with.contrast}</div>
    </div>` : ''}

    ${r.bunpro_tip ? `
    <div class="card">
      <div class="card-label">BunProのヒント</div>
      <div class="card-body">${r.bunpro_tip}</div>
    </div>` : ''}

    ${!opts.compact ? exportBar() : ''}`;
}

export function exportBar() {
  return `<div id="export-bar">
    <button class="ctrl-btn" id="copy-tsv-btn">Ankiにコピー (TSV)</button>
    <button class="ctrl-btn" id="copy-json-btn">JSONをコピー</button>
  </div>`;
}

export function renderError(msg) {
  const el = document.getElementById('result');
  el.innerHTML = `<div class="card"><div class="card-body" style="color:var(--pink)">エラー: ${msg}</div></div>`;
  el.style.display = 'block';
}

/* ── ANKI TSV ── */
export function toAnkiTSV(r) {
  const strip = s => s.replace(/<[^>]+>/g, '');
  if (r.mode === 'vocab') {
    return r.sentences.map(s =>
      [r.word, r.reading, strip(s.jp), s.translation].join('\t')
    ).join('\n');
  } else {
    return r.sentences.map(s =>
      [r.pattern, '', strip(s.jp), s.translation].join('\t')
    ).join('\n');
  }
}
