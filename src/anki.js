/**
 * anki.js — AnkiConnect client for struggling card detection and sentence management
 * No framework dependencies. Import from server.js.
 *
 * Requires AnkiConnect plugin installed in Anki (ankiweb.net/shared/info/2055492159)
 * and Anki to be open. Default URL: http://localhost:8765
 */

const ANKI_URL = process.env.ANKI_URL || 'http://localhost:8765';

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

  let deckName = '';
  if (note.cards?.length) {
    try {
      const cardInfos = await ankiRequest('cardsInfo', { cards: [note.cards[0]] });
      deckName = cardInfos?.[0]?.deckName || '';
    } catch { /* best-effort */ }
  }

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

  // Fallback: if no sentence field matched by name, parse the card template to find a back-only field
  let detectedByTemplate = false;
  if (!sentenceFieldKey) {
    const backField = await detectBackField(note.modelName, Object.keys(fields));
    if (backField) {
      sentenceFieldKey = backField;
      sentence = stripHtml(fields[backField].value || '');
      detectedByTemplate = true;
    }
  }

  return {
    noteId: note.noteId,
    modelName: note.modelName,
    deckName,
    sentence,
    sentenceMeaning,
    sentenceFieldKey,
    sentenceMeaningKey,
    sentenceAudioKey,
    allFields: Object.keys(fields),
    needsMigration: detectedByTemplate
  };
}

// Extract field references from an Anki card template string.
// Skips FrontSide, tts directives, and conditional/loop tags.
function extractTemplateFields(template) {
  const re = /\{\{(?!FrontSide|tts|#|\/|\^|cloze)([^:{}#^\/\s]+)\}\}/g;
  const names = new Set();
  let m;
  while ((m = re.exec(template)) !== null) names.add(m[1]);
  return names;
}

// When SENTENCE_KEYS name-match fails, fetch the note type's front template
// and return the first field that lives on the back but not the front.
async function detectBackField(modelName, fieldNames) {
  try {
    const templates = await ankiRequest('modelTemplates', { modelName });
    const cardName = Object.keys(templates)[0];
    const frontFields = extractTemplateFields(templates[cardName].Front);
    return fieldNames.find(f => !frontFields.has(f) && !WORD_KEYS.includes(f)) || null;
  } catch {
    return null;
  }
}

// Port of the frontend formatPitchDisplay(). Generates H/L/drop overline spans for Anki.
function formatPitchHtml(reading, pitchAccent) {
  if (!pitchAccent || !reading) return '';
  const n = pitchAccent.number;
  const smalls = new Set('ゃゅょぁぃぅぇぉャュョァィゥェォ');
  const morae = [];
  for (let i = 0; i < reading.length; i++) {
    if (i + 1 < reading.length && smalls.has(reading[i + 1])) {
      morae.push(reading[i] + reading[i + 1]); i++;
    } else morae.push(reading[i]);
  }
  const isHigh = i => n === 0 ? i > 0 : n === 1 ? i === 0 : (i > 0 && i < n);
  const dropIdx = n === 0 ? -1 : n - 1;
  const spans = morae.map((m, i) =>
    i === dropIdx ? `<span class="pd">${m}</span>`
    : isHigh(i) ? `<span class="ph">${m}</span>`
    : `<span class="pl">${m}</span>`
  ).join('');
  return `<span class="pitch-display">${spans}</span>`;
}

// Wraps the target word in <b> tags in the plain sentence.
// CSS rule b{color:#4fd8e8} in the Companion card template makes it cyan (matching Kaishi's b{color:...} approach).
function highlightWordInSentence(sentence, word) {
  if (!word || !sentence) return sentence;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(escaped, 'g'), `<b>${word}</b>`);
}

// Returns a {{tts}} tag using ANKI_TTS_VOICES env var if set, otherwise bare tag.
function buildTtsTag(fieldKey) {
  const voices = process.env.ANKI_TTS_VOICES;
  return voices
    ? `{{tts ja_JP voices=${voices}:${fieldKey}}}`
    : `{{tts ja_JP:${fieldKey}}}`;
}

// Upgrades a bare {{tts ja_JP:field}} tag in an existing back template to include voices.
// No-op if voices aren't configured, or if the template already has the desired tag.
async function upgradeModelTTSTag(modelName, fieldKey) {
  const bareTag = `{{tts ja_JP:${fieldKey}}}`;
  const desiredTag = buildTtsTag(fieldKey);
  if (bareTag === desiredTag) return;
  const templates = await ankiRequest('modelTemplates', { modelName });
  const cardName = Object.keys(templates)[0];
  const back = templates[cardName].Back;
  if (!back.includes(bareTag) || back.includes(desiredTag)) return;
  await ankiRequest('updateModelTemplates', {
    model: { name: modelName, templates: { [cardName]: { Back: back.replace(bareTag, desiredTag) } } }
  });
}

// Adds a TTS tag to an existing note type's back template.
// If the template already has a {{#Sentence}} section (enriched card), delegates to
// patchModelWithSentenceSection to avoid standalone tags conflicting with the section.
// Otherwise strips all existing TTS tags for this field and appends exactly one correct tag.
async function patchModelForTTS(modelName, sentenceFieldKey, sentenceAudioKey) {
  const templates = await ankiRequest('modelTemplates', { modelName });
  const cardName = Object.keys(templates)[0];
  const back = templates[cardName].Back;

  // Enriched cards manage TTS inside {{#Sentence}} — delegate to avoid standalone duplicates
  if (sentenceFieldKey === 'Sentence' && back.includes('{{#Sentence}}')) {
    await patchModelWithSentenceSection(modelName);
    return;
  }

  const desiredTag = buildTtsTag(sentenceFieldKey);
  const bareTag = `{{tts ja_JP:${sentenceFieldKey}}}`;

  // Already clean: desired tag present, no stale bare tag
  if (back.includes(desiredTag) && (desiredTag === bareTag || !back.includes(bareTag))) return;

  // Strip all existing TTS tags for this field (bare, voices, conditional-wrapped)
  // to prevent duplicates regardless of how the template was previously patched
  let newBack = back;
  const tagsToStrip = desiredTag === bareTag ? [bareTag] : [bareTag, desiredTag];
  for (const tag of tagsToStrip) {
    if (sentenceAudioKey) {
      newBack = newBack
        .replace(`\n{{^${sentenceAudioKey}}}${tag}{{/${sentenceAudioKey}}}`, '')
        .replace(`{{^${sentenceAudioKey}}}${tag}{{/${sentenceAudioKey}}}`, '');
    }
    newBack = newBack.replace(`\n${tag}`, '').replace(tag, '');
  }

  // Append exactly one correct tag
  newBack += sentenceAudioKey
    ? `\n{{^${sentenceAudioKey}}}${desiredTag}{{/${sentenceAudioKey}}}`
    : `\n${desiredTag}`;

  await ankiRequest('updateModelTemplates', {
    model: { name: modelName, templates: { [cardName]: { Back: newBack } } }
  });
}

async function updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey, modelName, word, sentenceHtml) {
  if (!sentenceFieldKey) throw new Error('sentenceFieldKey is required');

  const fields = {};
  fields[sentenceFieldKey] = sentence;
  if (sentenceMeaningKey && sentenceMeaning) fields[sentenceMeaningKey] = sentenceMeaning;
  if (sentenceAudioKey) fields[sentenceAudioKey] = '';  // clear stale audio so TTS takes over

  // Also update Companion layout fields if they exist on this note type
  if (modelName && (word || sentenceHtml)) {
    try {
      const existing = new Set(await ankiRequest('modelFieldNames', { modelName }));
      if (word && existing.has('Sentence Highlighted'))
        fields['Sentence Highlighted'] = highlightWordInSentence(sentence, word);
      if (sentenceHtml && existing.has('Sentence Furigana'))
        fields['Sentence Furigana'] = sentenceHtml;
    } catch { /* best-effort — don't fail the sentence update */ }
  }

  await ankiRequest('updateNoteFields', { note: { id: noteId, fields } });

  if (modelName) {
    try {
      await patchModelForTTS(modelName, sentenceFieldKey, sentenceAudioKey);
    } catch { /* template patch is best-effort — don't fail the update */ }
  }
}

// Companion card templates (built at call time so buildTtsTag() sees the current env).
const COMPANION_CSS = `.card {
  font-family: "Hiragino Kaku Gothic Pro", "Noto Sans JP", "Noto Sans CJK JP", sans-serif;
  font-size: 44px;
  text-align: center;
  color: #e8e8f0;
  background: #0d0d1a;
}
b { color: #4fd8e8 }
ruby rt { font-size: 0.38em; color: #ff6fa8; }
.pitch-display { display: inline-flex; align-items: flex-end; }
.ph { display: inline-block; border-top: 2px solid #4fd8e8; padding: 0 1px; }
.pl { display: inline-block; border-top: 2px solid transparent; padding: 0 1px; }
.pd { display: inline-block; border-top: 2px solid #4fd8e8; border-right: 2px solid #4fd8e8; padding: 0 3px 0 1px; }`;

const COMPANION_FRONT = `<!-- companion-v3 -->
<div lang="ja">
{{Word}}
{{#Sentence Highlighted}}<div style='font-size: 20px;'>{{Sentence Highlighted}}</div>{{/Sentence Highlighted}}
{{^Sentence Highlighted}}{{#Sentence}}<div style='font-size: 20px;'>{{Sentence}}</div>{{/Sentence}}{{/Sentence Highlighted}}
</div>`;

function buildCompanionBack() {
  return `<div lang="ja">
{{Word Furigana}}

{{#Pitch}}<br><div style='font-size: 24px'>{{Pitch}}</div>{{/Pitch}}

<div style='font-size: 25px; padding-bottom:20px'>{{Meaning}}</div>
{{#Sentence Furigana}}<div style='font-size: 25px;'>{{Sentence Furigana}}</div>{{/Sentence Furigana}}
{{^Sentence Furigana}}{{#Sentence}}<div style='font-size: 25px;'>{{Sentence}}</div>{{/Sentence}}{{/Sentence Furigana}}
{{#Sentence Meaning}}<div style='font-size: 25px; padding-bottom:10px'>{{Sentence Meaning}}</div>{{/Sentence Meaning}}

{{#Reading}}${buildTtsTag('Reading')}{{/Reading}}
{{#Sentence}}${buildTtsTag('Sentence')}{{/Sentence}}

{{#Frequency}}<br><div style="font-size: 20px; padding-top:12px">{{Frequency}}</div>{{/Frequency}}
{{#Notes}}<br><div style="font-size: 20px; padding-top:12px">{{Notes}}</div>{{/Notes}}
</div>`;
}

// Creates the "Companion" note type via AnkiConnect if it doesn't already exist.
// The back template uses buildTtsTag so premium voices are used when ANKI_TTS_VOICES is set.
// If the model already exists with a bare TTS tag, upgrades it to the voices version.
async function ensureCompanionModel() {
  const modelName = process.env.ANKI_COMPANION_MODEL || 'Companion';
  const names = await ankiRequest('modelNames');

  if (names.includes(modelName)) {
    // Add any new fields that didn't exist in earlier versions
    const existing = new Set(await ankiRequest('modelFieldNames', { modelName }));
    for (const f of ['Word Furigana', 'Pitch', 'Sentence Highlighted', 'Sentence Furigana']) {
      if (!existing.has(f)) await ankiRequest('modelFieldAdd', { modelName, fieldName: f });
    }
    // Upgrade template if it's missing the v3 sentinel (raw HTML furigana fields)
    try {
      const templates = await ankiRequest('modelTemplates', { modelName });
      const cardName = Object.keys(templates)[0];
      if (!templates[cardName].Front.includes('companion-v3')) {
        await ankiRequest('updateModelTemplates', {
          model: { name: modelName, templates: { [cardName]: { Front: COMPANION_FRONT, Back: buildCompanionBack() } } }
        });
        await ankiRequest('updateModelStyling', { model: { name: modelName, css: COMPANION_CSS } });
      }
    } catch { /* best-effort — don't fail if template update fails */ }
    try { await upgradeModelTTSTag(modelName, 'Sentence'); } catch { /* best-effort */ }
    return modelName;
  }

  await ankiRequest('createModel', {
    modelName,
    inOrderFields: ['Word', 'Reading', 'Word Furigana', 'Pitch', 'Meaning',
      'Sentence', 'Sentence Highlighted', 'Sentence Furigana', 'Sentence Meaning',
      'Frequency', 'Notes'],
    css: COMPANION_CSS,
    cardTemplates: [{ Name: 'Card 1', Front: COMPANION_FRONT, Back: buildCompanionBack() }]
  });
  return modelName;
}

async function addNoteForWord(result, sentence) {
  const deckName = process.env.ANKI_COMPANION_DECK || 'Companion';
  const modelName = await ensureCompanionModel();
  await ankiRequest('createDeck', { deck: deckName });  // idempotent — ensures deck exists before addNote
  const word = stripHtml(result.word || '');
  const reading = result.reading || '';
  const jpPlain = stripHtml(sentence.jp || '');

  return ankiRequest('addNote', {
    note: {
      deckName,
      modelName,
      fields: {
        'Word': word,
        'Reading': reading,
        'Word Furigana': word && reading ? `<ruby>${word}<rt>${reading}</rt></ruby>` : word,
        'Pitch': formatPitchHtml(reading, result.pitch_accent),
        'Meaning': stripHtml(result.core_meaning || ''),
        'Sentence': jpPlain,
        'Sentence Highlighted': highlightWordInSentence(jpPlain, word),
        'Sentence Furigana': sentence.jp || '',
        'Sentence Meaning': sentence.translation || '',
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

const COMPANION_FIELDS = ['Reading', 'Meaning', 'Sentence', 'Sentence Highlighted',
  'Sentence Furigana', 'Sentence Meaning', 'Frequency', 'Notes'];

// Adds any COMPANION_FIELDS that don't already exist on the note type.
async function enrichNoteType(modelName, requiredFields) {
  const existing = new Set(await ankiRequest('modelFieldNames', { modelName }));
  for (const field of requiredFields) {
    if (!existing.has(field)) {
      await ankiRequest('modelFieldAdd', { modelName, fieldName: field });
    }
  }
}

// Appends or maintains {{#Reading}} + {{#Sentence}} TTS blocks in the back template.
// Word TTS (Reading field, hiragana) fires first, then sentence TTS — mirrors Kaishi audio order.
// Upgrade path: upgrades stale TTS tags, removes standalone duplicates, injects Reading block if missing.
async function patchModelWithSentenceSection(modelName) {
  const templates = await ankiRequest('modelTemplates', { modelName });
  const cardName = Object.keys(templates)[0];
  const back = templates[cardName].Back;

  const desiredTag = buildTtsTag('Sentence');

  if (back.includes('{{#Sentence}}')) {
    // Replace any TTS tag for Sentence inside the section with the desired one
    let newBack = back.replace(
      /({{#Sentence}}[\s\S]*?){{tts [^}]*:Sentence}}([\s\S]*?{{\/Sentence}})/,
      `$1${desiredTag}$2`
    );
    // Remove standalone {{tts...:Sentence}} tags that ended up outside the section
    newBack = newBack.replace(/\n?{{tts [^}]*:Sentence}}/g, (match, offset) => {
      const before = newBack.substring(0, offset);
      const lastOpen = before.lastIndexOf('{{#Sentence}}');
      const lastClose = before.lastIndexOf('{{/Sentence}}');
      return (lastOpen !== -1 && lastOpen > lastClose) ? match : '';
    });
    // Inject or upgrade {{#Reading}} TTS block before {{#Sentence}}
    const desiredReadingTag = buildTtsTag('Reading');
    const readingBlock = `{{#Reading}}${desiredReadingTag}{{/Reading}}`;
    if (!newBack.includes(readingBlock)) {
      if (newBack.includes('{{#Reading}}')) {
        // Block exists but voices list changed — upgrade the TTS tag inside it
        newBack = newBack.replace(/\{\{#Reading\}\}\{\{tts [^}]*:Reading\}\}\{\{\/Reading\}\}/, readingBlock);
      } else {
        // Not present yet — insert on the line before {{#Sentence}}
        newBack = newBack.replace('{{#Sentence}}', readingBlock + '\n{{#Sentence}}');
      }
    }
    if (newBack !== back) {
      await ankiRequest('updateModelTemplates', {
        model: { name: modelName, templates: { [cardName]: { Back: newBack } } }
      });
    }
    return;
  }

  const section = `\n{{#Reading}}${buildTtsTag('Reading')}{{/Reading}}\n{{#Sentence}}<hr><div style="font-size:1.1em;margin:0.5em 0">{{Sentence}}</div>${desiredTag}<div style="color:#888;font-size:0.9em">{{Sentence Meaning}}</div>{{/Sentence}}`;
  await ankiRequest('updateModelTemplates', {
    model: { name: modelName, templates: { [cardName]: { Back: back + section } } }
  });
}

// For non-standard note types (e.g. Pokémon Front/Back):
// expands the schema with companion fields, writes all values, patches the back template.
// Review history (scheduling) is fully preserved — only the fields and template change.
async function enrichAndUpdateCard(noteId, modelName, result, jpPlain, translation, sentenceHtml) {
  await enrichNoteType(modelName, COMPANION_FIELDS);

  const word = stripHtml(result.word || '');
  const fields = {
    'Reading': result.reading || '',
    'Meaning': stripHtml(result.core_meaning || ''),
    'Sentence': jpPlain,
    'Sentence Highlighted': word ? highlightWordInSentence(jpPlain, word) : jpPlain,
    'Sentence Furigana': sentenceHtml || '',
    'Sentence Meaning': translation || '',
    'Frequency': stripHtml(result.frequency || ''),
    'Notes': stripHtml(result.anki_hint || ''),
  };
  await ankiRequest('updateNoteFields', { note: { id: noteId, fields } });

  try { await patchModelWithSentenceSection(modelName); } catch { /* best-effort */ }
}

// ── GRAMMAR COMPANION MODEL ──────────────────────────────────────────────────

const GRAMMAR_CSS = `.card {
  font-family: "Hiragino Kaku Gothic Pro", "Noto Sans JP", "Noto Sans CJK JP", sans-serif;
  font-size: 44px;
  text-align: center;
  color: #e8e8f0;
  background: #0d0d1a;
}
.pattern { color: #b97fff; }
b { color: #4fd8e8; }
ruby rt { font-size: 0.38em; color: #ff6fa8; }
.mistake { color: #ffe066; font-size: 0.65em; margin-top: 0.4em; }`;

const GRAMMAR_FRONT = `<!-- companion-grammar-v1 -->
<div lang="ja" class="pattern">{{Pattern}}</div>
{{#Sentence}}<div lang="ja" style="font-size: 20px; color: #e8e8f0; margin-top: 0.7em">{{Sentence}}</div>{{/Sentence}}`;

function buildGrammarBack() {
  return `<div lang="ja" class="pattern">{{Pattern}}</div>

<div style="font-size: 25px; padding: 12px 0">{{Meaning}}</div>

{{#Formation}}<div lang="ja" style="font-size: 20px; color: #9b94c0; padding-bottom: 8px">{{Formation}}</div>{{/Formation}}
{{#Common Mistake}}<div class="mistake">⚠️ {{Common Mistake}}</div>{{/Common Mistake}}

<hr>

{{#Sentence Furigana}}<div lang="ja" style="font-size: 25px; padding: 12px 0">{{Sentence Furigana}}</div>{{/Sentence Furigana}}
{{^Sentence Furigana}}{{#Sentence}}<div lang="ja" style="font-size: 25px; padding: 12px 0">{{Sentence}}</div>{{/Sentence}}{{/Sentence Furigana}}
{{#Sentence Meaning}}<div style="font-size: 20px; color: #9b94c0; padding-bottom: 12px">{{Sentence Meaning}}</div>{{/Sentence Meaning}}

{{#Sentence}}${buildTtsTag('Sentence')}{{/Sentence}}

{{#Notes}}<hr><div style="font-size: 18px; color: #9b94c0; padding-top: 8px">{{Notes}}</div>{{/Notes}}`;
}

async function ensureGrammarModel() {
  const modelName = process.env.ANKI_GRAMMAR_MODEL || 'Companion Grammar';
  const names = await ankiRequest('modelNames');
  if (names.includes(modelName)) return modelName;

  await ankiRequest('createModel', {
    modelName,
    inOrderFields: ['Pattern', 'Meaning', 'Formation', 'Common Mistake',
      'Sentence', 'Sentence Furigana', 'Sentence Meaning', 'Notes'],
    css: GRAMMAR_CSS,
    cardTemplates: [{ Name: 'Card 1', Front: GRAMMAR_FRONT, Back: buildGrammarBack() }]
  });
  return modelName;
}

async function addNoteForGrammar(result, sentence) {
  const deckName = process.env.ANKI_COMPANION_DECK || 'Companion';
  const modelName = await ensureGrammarModel();
  await ankiRequest('createDeck', { deck: deckName });
  const jpPlain = stripHtml(sentence.jp || '');

  return ankiRequest('addNote', {
    note: {
      deckName,
      modelName,
      fields: {
        'Pattern': result.pattern || '',
        'Meaning': stripHtml(result.real_meaning || ''),
        'Formation': stripHtml(result.formation?.rule || ''),
        'Common Mistake': stripHtml(result.formation?.common_mistake || ''),
        'Sentence': jpPlain,
        'Sentence Furigana': sentence.jp || '',
        'Sentence Meaning': sentence.translation || '',
        'Notes': stripHtml(result.bunpro_tip || ''),
      },
      options: { allowDuplicate: false, duplicateScope: 'deck' },
      tags: ['companion', 'grammar']
    }
  });
}

module.exports = { getStrugglingCards, findNoteForWord, updateCardSentence, addNoteForWord, addNoteForGrammar, getDeckNames, enrichAndUpdateCard };
