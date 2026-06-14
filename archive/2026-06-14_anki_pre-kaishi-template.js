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

async function updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey, modelName) {
  if (!sentenceFieldKey) throw new Error('sentenceFieldKey is required');

  const fields = {};
  fields[sentenceFieldKey] = sentence;
  if (sentenceMeaningKey && sentenceMeaning) fields[sentenceMeaningKey] = sentenceMeaning;
  if (sentenceAudioKey) fields[sentenceAudioKey] = '';  // clear stale audio so TTS takes over

  await ankiRequest('updateNoteFields', { note: { id: noteId, fields } });

  if (modelName) {
    try {
      await patchModelForTTS(modelName, sentenceFieldKey, sentenceAudioKey);
    } catch { /* template patch is best-effort — don't fail the update */ }
  }
}

// Creates the "Companion" note type via AnkiConnect if it doesn't already exist.
// The back template uses buildTtsTag so premium voices are used when ANKI_TTS_VOICES is set.
// If the model already exists with a bare TTS tag, upgrades it to the voices version.
async function ensureCompanionModel() {
  const modelName = process.env.ANKI_COMPANION_MODEL || 'Companion';
  const names = await ankiRequest('modelNames');
  if (names.includes(modelName)) {
    try { await upgradeModelTTSTag(modelName, 'Sentence'); } catch { /* best-effort */ }
    return modelName;
  }

  await ankiRequest('createModel', {
    modelName,
    inOrderFields: ['Word', 'Reading', 'Meaning', 'Sentence', 'Sentence Meaning', 'Frequency', 'Notes'],
    css: `.card { font-family: Arial, sans-serif; font-size: 20px; text-align: center; }
.word { font-size: 2em; margin-bottom: 0.3em; }
.reading { color: #888; margin-bottom: 0.8em; }
.sentence { font-size: 1.1em; margin: 0.8em 0; text-align: left; }
.sentence-meaning { color: #666; font-size: 0.9em; text-align: left; }
.meta { color: #999; font-size: 0.8em; }`,
    cardTemplates: [{
      Name: 'Card 1',
      Front: `<div class="word">{{Word}}</div><div class="reading">{{Reading}}</div>`,
      Back: `{{FrontSide}}<hr id=answer>
<div class="meaning">{{Meaning}}</div>
<div class="sentence">{{Sentence}}</div>
${buildTtsTag('Sentence')}
<div class="sentence-meaning">{{Sentence Meaning}}</div>
{{#Frequency}}<div class="meta">{{Frequency}}</div>{{/Frequency}}
{{#Notes}}<div class="meta">{{Notes}}</div>{{/Notes}}`
    }]
  });
  return modelName;
}

async function addNoteForWord(result, sentence) {
  const deckName = process.env.ANKI_COMPANION_DECK || 'Companion';
  const modelName = await ensureCompanionModel();
  const jpPlain = stripHtml(sentence.jp);

  return ankiRequest('addNote', {
    note: {
      deckName,
      modelName,
      fields: {
        'Word': stripHtml(result.word || ''),
        'Reading': result.reading || '',
        'Meaning': stripHtml(result.core_meaning || ''),
        'Sentence': jpPlain,
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

const COMPANION_FIELDS = ['Reading', 'Meaning', 'Sentence', 'Sentence Meaning', 'Frequency', 'Notes'];

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
async function enrichAndUpdateCard(noteId, modelName, result, jpPlain, translation) {
  await enrichNoteType(modelName, COMPANION_FIELDS);

  const fields = {
    'Reading': result.reading || '',
    'Meaning': stripHtml(result.core_meaning || ''),
    'Sentence': jpPlain,
    'Sentence Meaning': translation || '',
    'Frequency': stripHtml(result.frequency || ''),
    'Notes': stripHtml(result.anki_hint || ''),
  };
  await ankiRequest('updateNoteFields', { note: { id: noteId, fields } });

  try { await patchModelWithSentenceSection(modelName); } catch { /* best-effort */ }
}

module.exports = { getStrugglingCards, findNoteForWord, updateCardSentence, addNoteForWord, getDeckNames, enrichAndUpdateCard };
