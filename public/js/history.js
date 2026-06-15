const MAX_HISTORY = 50;

let history = [];

const LEGACY_KEY = 'companion_history_v1';

export async function initHistory() {
  try {
    // One-time migration: if localStorage has entries, merge them into the server
    const legacy = (() => {
      try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch { return []; }
    })();
    if (legacy.length) {
      const res = await fetch('/api/history', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: legacy }),
      });
      if (res.ok) localStorage.removeItem(LEGACY_KEY);
      const data = await res.json();
      history = data.entries || [];
    } else {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        history = data.entries || [];
      }
    }
    updateHistoryBadge();
  } catch {}
}

export function addToHistory(r) {
  // Optimistic local update
  history = history.filter(h => !(h.input === r.input && !!h.jj === !!r.jj));
  history.unshift(r);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  updateHistoryBadge();
  // Persist to server (fire-and-forget)
  fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: r }),
  }).catch(() => {});
}

export function findInHistory(input, jj) {
  return history.find(h => h.input === input && !!h.jj === jj);
}

export function clearHistory() {
  history = [];
  updateHistoryBadge();
  fetch('/api/history', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true }),
  }).catch(() => {});
}

export function updateHistoryBadge() {
  const b = document.getElementById('history-count');
  b.textContent = history.length;
  b.style.display = history.length ? 'inline-block' : 'none';
}

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

// onSelect(r) is called when an entry is clicked; wired by the caller (main script)
export function openHistoryPanel(onSelect) {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  list.innerHTML = '';

  const existingSearch = document.getElementById('h-search-row');
  if (existingSearch) existingSearch.remove();
  const searchRow = document.createElement('div');
  searchRow.id = 'h-search-row';
  searchRow.innerHTML = `
    <input id="h-search" placeholder="検索…" style="width:100%;box-sizing:border-box;background:var(--card);border:1px solid var(--border2);color:var(--text);padding:0.4rem 0.6rem;border-radius:6px;font-size:0.85rem;margin-bottom:0.5rem">
    <div id="h-mode-pills" style="display:flex;gap:0.4rem;margin-bottom:0.75rem">
      <button class="deck-pill active" data-mode="all">全て</button>
      <button class="deck-pill" data-mode="vocab">単語</button>
      <button class="deck-pill" data-mode="grammar">文法</button>
    </div>`;
  list.before(searchRow);

  if (!history.length) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    history.forEach(r => {
      const d = document.createElement('div');
      d.className = 'history-entry';
      d.dataset.word = r.input || '';
      d.dataset.mode = r.mode || 'vocab';
      const label = r.mode === 'vocab' ? (r.word || r.input) : (r.pattern || r.input);
      const reading = r.reading || '';
      const time = r.timestamp ? new Date(r.timestamp).toLocaleDateString('ja-JP') : '';
      d.innerHTML = `
        <span class="h-word">${label}</span>
        <span class="h-reading">${reading}</span>
        <span class="h-mode ${r.mode}">${r.mode === 'vocab' ? '単語' : '文法'}</span>
        <span class="h-time">${time}</span>`;
      const delBtn = document.createElement('button');
      delBtn.className = 'h-del-btn';
      delBtn.textContent = '✕';
      delBtn.title = '削除';
      delBtn.onclick = e => {
        e.stopPropagation();
        if (!confirm(`「${label}」を履歴から削除しますか？`)) return;
        history = history.filter(h => !(h.input === r.input && !!h.jj === !!r.jj));
        updateHistoryBadge();
        fetch('/api/history', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: r.input, jj: r.jj }),
        }).catch(() => {});
        d.remove();
        if (!document.querySelectorAll('#history-list .history-entry').length)
          document.getElementById('history-empty').style.display = '';
      };
      d.appendChild(delBtn);
      d.onclick = () => onSelect(r);
      list.appendChild(d);
    });
  }

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

  document.getElementById('history-panel').style.display = 'block';
}
