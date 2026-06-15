import { speak } from './tts.js';
import { toAnkiTSV } from './render.js';

function formatAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}分`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}時間`;
  return `${Math.round(hrs / 24)}日`;
}

let currentAnkiNote = null;
let pendingAnkiBtn = null;
let pendingTimer = null;

function cancelPendingAnki() {
  if (pendingAnkiBtn) {
    pendingAnkiBtn.textContent = '→ Anki';
    pendingAnkiBtn.classList.remove('pending');
    pendingAnkiBtn = null;
  }
  clearTimeout(pendingTimer);
  pendingTimer = null;
}

export async function checkAnkiCard(result) {
  currentAnkiNote = null;
  const section = document.getElementById('anki-card-section');
  if (!section) return;
  section.style.display = 'none';

  let data;
  try {
    const res = await fetch(`/api/anki/card?word=${encodeURIComponent(result.word || result.input)}`);
    data = await res.json();
  } catch { return; }
  if (data.error) return;

  section.style.display = '';
  const sentenceEl = document.getElementById('anki-current-sentence');
  const meaningEl  = document.getElementById('anki-current-meaning');
  const statusEl   = document.getElementById('anki-card-status');
  const deckEl     = document.getElementById('anki-deck-name');

  if (data.found) {
    deckEl.textContent = data.deckName || '';
    deckEl.style.display = data.deckName ? '' : 'none';
    currentAnkiNote = data;
    sentenceEl.textContent = data.sentence || '(例文なし)';
    meaningEl.textContent = data.sentenceMeaning || '';
    if (!data.sentenceFieldKey) {
      statusEl.textContent = '例文フィールドを特定できませんでした';
      document.querySelectorAll('.anki-send-btn').forEach(btn => btn.style.display = 'none');
    } else if (data.needsMigration) {
      statusEl.textContent = '↓ 例文を送ると Reading・Meaning・Sentence 等のフィールドをカードに追加します';
      document.querySelectorAll('.anki-send-btn').forEach(btn => {
        btn.style.display = '';
        btn.title = 'カードを拡張してAnkiに送る';
      });
    } else {
      statusEl.textContent = `↓ 下の例文で「${data.sentenceFieldKey}」フィールドを置き換えられます`;
      document.querySelectorAll('.anki-send-btn').forEach(btn => {
        btn.style.display = '';
        btn.title = 'Ankiの例文を置き換える';
      });
    }
  } else {
    deckEl.textContent = '';
    deckEl.style.display = 'none';
    sentenceEl.textContent = 'このデッキにカードがありません';
    meaningEl.textContent = '';
    statusEl.textContent = '↓ 例文ボタンで「Companion」デッキにカードを新規作成';
    document.querySelectorAll('.anki-send-btn').forEach(btn => {
      btn.style.display = '';
      btn.title = 'Ankiにカードを追加';
    });
  }
}

// onWordClick(word) — called when a struggling card is clicked
export async function openAnkiPanel(onWordClick) {
  const panel  = document.getElementById('anki-panel');
  const list   = document.getElementById('anki-list');
  const empty  = document.getElementById('anki-empty');
  const status = document.getElementById('anki-status');

  list.innerHTML = '';
  empty.style.display = 'none';
  status.innerHTML = '<div style="color:var(--text2);padding:1rem 0">読み込み中…</div>';
  panel.style.display = 'block';

  try {
    const res  = await fetch('/api/anki/struggling');
    const data = await res.json();

    if (!res.ok) {
      status.innerHTML = `<div style="color:var(--pink);padding:1rem 0;line-height:1.6">
        AnkiConnectが見つかりません。<br>
        <span style="color:var(--text2);font-size:0.85rem">Ankiを開くとデータが同期されます。<br>（Add-on code: 2055492159）</span>
      </div>`;
      return;
    }

    if (data.fromCache && data.cachedAt) {
      const ago = formatAgo(data.cachedAt);
      status.innerHTML = `<div style="color:var(--text3);font-size:0.72rem;padding:0.4rem 0 0.8rem">
        キャッシュ（${ago}前に同期）— Ankiを開くと最新データに更新されます
      </div>`;
    } else {
      status.innerHTML = '';
    }

    if (!data.cards.length) {
      status.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    const decks = [...new Set(data.cards.map(c => c.deckName))].sort();
    const activeDecks = new Set(decks);

    const filterRow = document.createElement('div');
    filterRow.id = 'deck-filter';
    decks.forEach(deck => {
      const pill = document.createElement('button');
      pill.className = 'deck-pill active';
      pill.textContent = deck;
      pill.dataset.deck = deck;
      pill.onclick = () => {
        if (activeDecks.has(deck)) {
          if (activeDecks.size === 1) return;
          activeDecks.delete(deck);
          pill.classList.remove('active');
        } else {
          activeDecks.add(deck);
          pill.classList.add('active');
        }
        document.querySelectorAll('#anki-list .history-entry').forEach(el => {
          el.style.display = activeDecks.has(el.dataset.deck) ? '' : 'none';
        });
      };
      filterRow.appendChild(pill);
    });

    const summary = document.createElement('div');
    summary.style.cssText = 'color:var(--text2);font-size:0.8rem;padding-bottom:0.25rem';
    summary.textContent = `${data.total}枚中、上位${data.cards.length}枚を表示（ミス回数順）`;
    status.innerHTML = '';
    status.appendChild(summary);
    status.appendChild(filterRow);

    data.cards.forEach(card => {
      const lapseColor = card.lapses >= 5 ? 'var(--pink)' : card.lapses >= 3 ? '#ff9944' : 'var(--yellow)';
      const d = document.createElement('div');
      d.className = 'history-entry';
      d.dataset.deck = card.deckName;
      d.innerHTML = `
        <span class="h-word">${card.word}</span>
        <span style="font-size:0.75rem;font-weight:700;color:${lapseColor};margin-left:auto;white-space:nowrap">✕${card.lapses}</span>
        <span class="h-time">${card.deckName}</span>`;
      d.onclick = () => {
        panel.style.display = 'none';
        onWordClick(card.word);
      };
      list.appendChild(d);
    });
  } catch (err) {
    status.innerHTML = `<div style="color:var(--pink);padding:1rem 0">エラー: ${err.message}</div>`;
  }
}

// Sets up all delegated click handlers on the #result element.
// getCurrentResult() returns the current lookup result for copy/send operations.
export function initAnkiResultHandlers(resultEl, getCurrentResult) {
  // Cancel pending confirm when clicking outside any anki-send-btn
  document.addEventListener('click', e => {
    if (pendingAnkiBtn && !e.target.closest('.anki-send-btn')) cancelPendingAnki();
  }, true);

  resultEl.addEventListener('click', async e => {
    // Speak buttons — word-header buttons carry data-speak with the reading directly;
    // sentence buttons find their text from the parent .sentence-item
    const speakBtn = e.target.closest('.speak-btn');
    if (speakBtn) {
      if (speakBtn.dataset.speak) {
        speak(speakBtn.dataset.speak, speakBtn);
      } else {
        const jpEl = speakBtn.closest('.sentence-item').querySelector('.sentence-jp');
        const clone = jpEl.cloneNode(true);
        clone.querySelectorAll('rt').forEach(rt => rt.remove());
        speak(clone.textContent, speakBtn);
      }
      return;
    }

    // Anki send buttons (two-click confirm)
    const sendBtn = e.target.closest('.anki-send-btn');
    if (sendBtn) {
      if (pendingAnkiBtn !== sendBtn) {
        cancelPendingAnki();
        pendingAnkiBtn = sendBtn;
        sendBtn.textContent = '確定?';
        sendBtn.classList.add('pending');
        pendingTimer = setTimeout(cancelPendingAnki, 3000);
        navigator.vibrate?.(20);
        return;
      }
      cancelPendingAnki();
      const item    = sendBtn.closest('.sentence-item');
      const jpClone = item.querySelector('.sentence-jp').cloneNode(true);
      jpClone.querySelectorAll('rt').forEach(rt => rt.remove());
      const jpText  = jpClone.textContent;
      const jpHtml  = item.querySelector('.sentence-jp').innerHTML;
      const enText  = item.querySelector('.sentence-en')?.textContent || '';
      sendBtn.textContent = '…';
      sendBtn.disabled = true;
      const currentResult = getCurrentResult();
      try {
        if (currentResult.mode === 'grammar') {
          const res = await fetch('/api/anki/grammar/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: currentResult, sentence: { jp: jpHtml, translation: enText } })
          });
          if (!res.ok) throw new Error(`Create failed: ${res.status}`);
        } else if (currentAnkiNote && currentAnkiNote.needsMigration) {
          const res = await fetch('/api/anki/card/enrich', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              noteId: currentAnkiNote.noteId,
              modelName: currentAnkiNote.modelName,
              result: currentResult,
              sentence: { jp: jpText, translation: enText, html: jpHtml }
            })
          });
          if (!res.ok) throw new Error(`Enrich failed: ${res.status}`);
          await checkAnkiCard(currentResult);
        } else if (currentAnkiNote) {
          const res = await fetch('/api/anki/card/sentence', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              noteId: currentAnkiNote.noteId,
              modelName: currentAnkiNote.modelName,
              sentenceFieldKey: currentAnkiNote.sentenceFieldKey,
              sentence: jpText,
              sentenceMeaning: enText,
              sentenceMeaningKey: currentAnkiNote.sentenceMeaningKey,
              sentenceAudioKey: currentAnkiNote.sentenceAudioKey,
              word: currentResult.word || currentResult.input,
              sentenceHtml: jpHtml
            })
          });
          if (!res.ok) throw new Error(`Update failed: ${res.status}`);
          document.getElementById('anki-current-sentence').textContent = jpText;
          document.getElementById('anki-current-meaning').textContent = enText;
        } else {
          const res = await fetch('/api/anki/card/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: currentResult, sentence: { jp: jpHtml, translation: enText } })
          });
          if (!res.ok) throw new Error(`Create failed: ${res.status}`);
          await checkAnkiCard(currentResult);
        }
        sendBtn.textContent = '✓';
        navigator.vibrate?.(50);
        setTimeout(() => { sendBtn.textContent = '→ Anki'; sendBtn.disabled = false; }, 2000);
      } catch {
        sendBtn.textContent = '✗';
        sendBtn.disabled = false;
      }
      return;
    }

    // Copy buttons
    const currentResult = getCurrentResult();
    if (e.target.id === 'copy-tsv-btn' && currentResult) {
      navigator.clipboard.writeText(toAnkiTSV(currentResult)).then(() => {
        e.target.textContent = 'コピーしました！';
        setTimeout(() => e.target.textContent = 'Ankiにコピー (TSV)', 2000);
      });
    }
    if (e.target.id === 'copy-json-btn' && currentResult) {
      navigator.clipboard.writeText(JSON.stringify(currentResult, null, 2)).then(() => {
        e.target.textContent = 'コピーしました！';
        setTimeout(() => e.target.textContent = 'JSONをコピー', 2000);
      });
    }
  });
}
