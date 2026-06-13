/**
 * anki.js — AnkiConnect client for struggling card detection and sentence management
 * No framework dependencies. Import from server.js.
 *
 * Requires AnkiConnect plugin installed in Anki (ankiweb.net/shared/info/2055492159)
 * and Anki to be open. Default URL: http://localhost:8765
 */

const ANKI_URL = process.env.ANKI_URL || 'http://localhost:8765';
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const VOICEVOX_SPEAKER = parseInt(process.env.VOICEVOX_SPEAKER || '1');

const WORD_KEYS = ['Word', 'Vocabulary', 'Front', 'Expression', 'Japanese', 'Kanji'];
const READING_KEYS = ['Reading', 'Furigana', 'Kana', 'Pronunciation'];
const SENTENCE_KEYS = ['Sentence', 'Example Sentence', 'Example', 'Context', 'Usage'];
const SENTENCE_MEANING_KEYS = ['Sentence Meaning', 'Sentence English', 'Translation', 'Meaning'];
const SENTENCE_AUDIO_KEYS = ['Sentence Audio', 'SentenceAudio', 'Audio Sentence'];

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

// Convert Claude's ruby HTML to Anki's 漢字[かんじ] furigana notation
function rubyToAnkiFurigana(html) {
  return html
    .replace(/<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g, '$1[$2]')
    .replace(/<[^>]+>/g, '');
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

async function findNoteForWord(word) {
  let noteIds = await ankiRequest('findNotes', { query: `Word:"${word}"` });
  if (!noteIds?.length) noteIds = await ankiRequest('findNotes', { query: `"${word}"` });
  if (!noteIds?.length) return null;

  const notes = await ankiRequest('notesInfo', { notes: [noteIds[0]] });
  const note = notes?.[0];
  if (!note) return null;

  const fields = note.fields || {};
  let sentence = '', sentenceMeaning = '';
  let sentenceFieldKey = '', sentenceMeaningKey = '', sentenceAudioKey = '';

  for (const k of SENTENCE_KEYS) {
    if (fields[k] !== undefined) { sentence = stripHtml(fields[k].value || ''); sentenceFieldKey = k; break; }
  }
  for (const k of SENTENCE_MEANING_KEYS) {
    if (fields[k] !== undefined) { sentenceMeaning = stripHtml(fields[k].value || ''); sentenceMeaningKey = k; break; }
  }
  for (const k of SENTENCE_AUDIO_KEYS) {
    if (fields[k] !== undefined) { sentenceAudioKey = k; break; }
  }

  return {
    noteId: note.noteId,
    sentence,
    sentenceMeaning,
    sentenceFieldKey,
    sentenceMeaningKey,
    sentenceAudioKey
  };
}

async function updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey) {
  const fields = {};
  fields[sentenceFieldKey] = sentence;
  if (sentenceMeaningKey && sentenceMeaning) fields[sentenceMeaningKey] = sentenceMeaning;

  if (sentenceAudioKey) {
    let audioTag = '';
    try {
      const filename = `companion_${Date.now()}.wav`;
      const base64 = await generateSentenceAudio(sentence);
      audioTag = await storeAudioAndGetTag(filename, base64);
    } catch { /* VoiceVox not running — clear stale audio */ }
    fields[sentenceAudioKey] = audioTag;
  }

  await ankiRequest('updateNoteFields', { note: { id: noteId, fields } });
}

async function addNoteForWord(result, sentence) {
  const deckName = process.env.ANKI_COMPANION_DECK || 'Companion';
  const modelName = 'Kaishi 1.5k';
  const jpPlain = stripHtml(sentence.jp);
  const jpFurigana = rubyToAnkiFurigana(sentence.jp);
  const wordFurigana = rubyToAnkiFurigana(result.word || '');

  let sentenceAudioTag = '';
  try {
    const filename = `companion_${Date.now()}.wav`;
    const base64 = await generateSentenceAudio(jpPlain);
    sentenceAudioTag = await storeAudioAndGetTag(filename, base64);
  } catch { /* VoiceVox not running — skip audio */ }

  return ankiRequest('addNote', {
    note: {
      deckName,
      modelName,
      fields: {
        'Word': stripHtml(result.word || ''),
        'Word Reading': result.reading || '',
        'Word Furigana': wordFurigana,
        'Word Meaning': stripHtml(result.core_meaning || ''),
        'Word Audio': '',
        'Sentence': jpPlain,
        'Sentence Meaning': sentence.translation || '',
        'Sentence Furigana': jpFurigana,
        'Sentence Audio': sentenceAudioTag,
        'Frequency': stripHtml(result.frequency || ''),
        'Notes': stripHtml(result.anki_hint || ''),
      },
      options: { allowDuplicate: false, duplicateScope: 'deck' },
      tags: ['companion']
    }
  });
}

async function getDeckNames() {
  return ankiRequest('deckNames');
}

async function generateSentenceAudio(text) {
  const queryRes = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${VOICEVOX_SPEAKER}`,
    { method: 'POST' }
  );
  if (!queryRes.ok) throw new Error('VoiceVox audio_query failed');
  const query = await queryRes.json();

  const synthRes = await fetch(
    `${VOICEVOX_URL}/synthesis?speaker=${VOICEVOX_SPEAKER}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }
  );
  if (!synthRes.ok) throw new Error('VoiceVox synthesis failed');
  const wavBuffer = await synthRes.arrayBuffer();
  return Buffer.from(wavBuffer).toString('base64');
}

async function storeAudioAndGetTag(filename, base64wav) {
  await ankiRequest('storeMediaFile', { filename, data: base64wav });
  return `[sound:${filename}]`;
}

module.exports = { getStrugglingCards, findNoteForWord, updateCardSentence, addNoteForWord, getDeckNames };
