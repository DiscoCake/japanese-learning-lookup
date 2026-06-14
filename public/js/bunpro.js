function srsClass(level) {
  const l = (level || '').toLowerCase();
  if (l === 'ghost')    return 'srs-ghost';
  if (l === 'master')   return 'srs-master';
  if (l === 'expert')   return 'srs-expert';
  if (l === 'seasoned') return 'srs-seasoned';
  if (l === 'adept')    return 'srs-adept';
  if (l === 'beginner') return 'srs-beginner';
  return 'srs-new';
}

function srsLabel(level) {
  const map = { ghost:'ゴースト', master:'マスター', expert:'エキスパート',
                seasoned:'シーズン', adept:'上達', beginner:'初心者', new:'新規' };
  return map[(level || '').toLowerCase()] || level || '不明';
}

function formatNextReview(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const now = new Date();
  const diffH = Math.round((d - now) / 3600000);
  if (diffH < 0) return '今すぐ';
  if (diffH < 1) return 'まもなく';
  if (diffH < 24) return `${diffH}時間後`;
  return `${Math.round(diffH / 24)}日後`;
}

export async function checkBunproStatus(result) {
  const section = document.getElementById('bunpro-status-section');
  const body    = document.getElementById('bunpro-status-body');
  if (!section || !body) return;
  section.style.display = 'none';

  let data;
  try {
    const res = await fetch(`/api/bunpro/grammar?pattern=${encodeURIComponent(result.pattern || result.input)}`);
    data = await res.json();
  } catch { return; }
  if (data.error) return; // key not set — silent

  section.style.display = '';

  if (!data.found) {
    body.innerHTML = `<span style="color:var(--text3);font-size:0.82rem">BunProに未登録</span>`;
    return;
  }

  const nextStr = formatNextReview(data.nextReview);
  const jlpt = data.jlpt ? `<span class="register-tag" style="margin-left:0.4rem">${data.jlpt}</span>` : '';
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.4rem">
      <span class="srs-pill ${srsClass(data.srsLevel)}">${srsLabel(data.srsLevel)}</span>
      ${jlpt}
    </div>
    <div style="font-size:0.8rem;color:var(--text2);display:flex;gap:1.2rem;flex-wrap:wrap">
      <span>次回 <strong style="color:var(--text)">${nextStr}</strong></span>
      <span>連続 <strong style="color:var(--green)">${data.correctStreak ?? 0}</strong></span>
      <span>失敗 <strong style="color:${(data.lapses || 0) >= 3 ? 'var(--pink)' : 'var(--text)'}">${data.lapses ?? 0}</strong></span>
    </div>`;
}

// onPatternClick(pattern) — called when a troubled grammar entry is clicked
export async function openBunproPanel(onPatternClick) {
  const panel  = document.getElementById('bunpro-panel');
  const list   = document.getElementById('bunpro-list');
  const empty  = document.getElementById('bunpro-empty');
  const status = document.getElementById('bunpro-status');

  list.innerHTML = '';
  empty.style.display = 'none';
  status.innerHTML = '<div style="color:var(--text2);padding:1rem 0">読み込み中…</div>';
  panel.style.display = 'block';

  try {
    const res  = await fetch('/api/bunpro/troubled');
    const data = await res.json();

    if (!res.ok) {
      const msg = data.error?.includes('BUNPRO_TOKEN')
        ? 'BUNPRO_TOKEN が設定されていません。<br><span style="font-size:0.82rem;color:var(--text2)">.env に BUNPRO_TOKEN を追加してサーバーを再起動してください。</span>'
        : `BunPro APIエラー: ${data.error || res.status}`;
      status.innerHTML = `<div style="color:var(--pink);padding:1rem 0;line-height:1.8">${msg}</div>`;
      return;
    }

    status.innerHTML = '';
    if (!data.items?.length) { empty.style.display = 'block'; return; }

    data.items.forEach(item => {
      const d = document.createElement('div');
      d.className = 'history-entry';
      const jlpt = item.jlpt ? `<span class="h-mode">${item.jlpt}</span>` : '';
      d.innerHTML = `
        <span class="h-word" style="color:var(--purple)">${item.pattern}</span>
        <span class="h-reading" style="color:var(--text3)">${item.reading || ''}</span>
        ${jlpt}
        <span class="srs-pill ${srsClass(item.srsLevel)}" style="margin-left:auto">${srsLabel(item.srsLevel)}</span>
        <span style="font-size:0.65rem;color:var(--pink);font-weight:700;white-space:nowrap">✕${item.lapses}</span>`;
      d.onclick = () => {
        const pat = item.pattern.startsWith('～') || item.pattern.startsWith('〜')
          ? item.pattern : `～${item.pattern}`;
        panel.style.display = 'none';
        onPatternClick(pat);
      };
      list.appendChild(d);
    });
  } catch (err) {
    status.innerHTML = `<div style="color:var(--pink);padding:1rem 0">エラー: ${err.message}</div>`;
  }
}
