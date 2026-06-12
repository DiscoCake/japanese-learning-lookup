/**
 * anki.js — AnkiConnect client for struggling card detection
 * No framework dependencies. Import from server.js.
 *
 * Requires AnkiConnect plugin installed in Anki (ankiweb.net/shared/info/2055492159)
 * and Anki to be open. Default URL: http://localhost:8765
 */

const ANKI_URL = process.env.ANKI_URL || 'http://localhost:8765';

const WORD_KEYS = ['Word', 'Vocabulary', 'Front', 'Expression', 'Japanese', 'Kanji'];
const READING_KEYS = ['Reading', 'Furigana', 'Kana', 'Pronunciation'];

async function ankiRequest(action, params = {}) {
  const res = await fetch(ANKI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params })
  });
  if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`AnkiConnect: ${data.error}`);
  return data.result;
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]+>/g, '').trim();
}

function extractFields(fields) {
  let word = '';
  let reading = '';

  for (const key of WORD_KEYS) {
    if (fields[key]?.value) { word = stripHtml(fields[key].value); break; }
  }
  if (!word) {
    const first = Object.values(fields)[0];
    word = stripHtml(first?.value || '');
  }

  for (const key of READING_KEYS) {
    if (fields[key]?.value) { reading = stripHtml(fields[key].value); break; }
  }

  return { word, reading };
}

async function getStrugglingCards({ minLapses = 2, limit = 50 } = {}) {
  const query = `prop:lapses>=${minLapses} -is:new`;
  const cardIds = await ankiRequest('findCards', { query });

  if (!cardIds || !cardIds.length) return { cards: [], total: 0 };

  const total = cardIds.length;
  const cardInfos = await ankiRequest('cardsInfo', { cards: cardIds });

  const cards = cardInfos
    .map(c => {
      const { word, reading } = extractFields(c.fields || {});
      return {
        word,
        reading,
        lapses: c.lapses || 0,
        interval: c.interval || 0,
        ease: Math.round((c.factor || 2500) / 10),
        deckName: c.deckName || ''
      };
    })
    .filter(c => c.word)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit);

  return { cards, total };
}

module.exports = { getStrugglingCards };
