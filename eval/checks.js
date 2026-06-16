/**
 * eval/checks.js — deterministic validators for lookup() output.
 *
 * Each check is a pure function: (result) => { pass: boolean, messages: string[] }.
 * No API calls, no DOM. These guard the output contracts documented in CLAUDE.md
 * and run for free against saved snapshots (npm run eval:check).
 *
 * The single most important invariant — "every kanji has ruby furigana" — is
 * encoded in everyKanjiHasRuby below.
 */

/* CJK ideographs (kanji). Excludes kana, the iteration mark 々 (U+3005), and
   punctuation, so only true ideographs trigger the ruby check. */
const KANJI = /[㐀-䶿一-鿿豈-﫿]/g;
const RUBY_BLOCK = /<ruby>[\s\S]*?<\/ruby>/g;

/* Return the kanji characters in `text` that are NOT inside a <ruby> block.
   We strip whole <ruby>…</ruby> blocks first (base kanji + <rt> reading both
   live inside), then any kanji left over is un-annotated. */
function strayKanji(text) {
  if (typeof text !== 'string' || !text) return [];
  const stripped = text.replace(RUBY_BLOCK, '');
  return stripped.match(KANJI) || [];
}

/* Allowed register values per mode (from the system prompts in lookup.js). */
const REGISTERS = {
  vocab: ['casual', 'standard', 'formal', 'written'],
  grammar: ['casual', 'standard', 'formal'],
};

/* Japanese-prose fields that MUST carry ruby on every kanji.
   Deliberately excludes:
   - word / pattern (top-level): given as-is, not annotated
   - reading, confused_with.reading: kana, no kanji
   - pitch_accent.label/pattern: metadata labels (頭高 etc.) intentionally un-ruby'd
   - translation: English by contract
   - sentences[].notes: frequently English in J-E mode; excluded to avoid false
     positives. Flip `includeNotes` to true to tighten this later. */
function prosePairs(result, { includeNotes = false } = {}) {
  const pairs = [];
  const add = (field, text) => { if (text) pairs.push({ field, text }); };

  // JJ results: skip ruby check on explanation prose — the model consistently
  // omits ruby on common kanji (使, 上, 多…) when writing natural Japanese prose,
  // and an N4 learner reading explanation text knows those kanji. Ruby is still
  // enforced on sentences[i].jp, which is the carefully-read display text.
  if (!result._jj) {
    if (result.mode === 'vocab') {
      add('core_meaning', result.core_meaning);
      add('dont_use', result.dont_use);
      add('frequency', result.frequency);
      add('anki_hint', result.anki_hint);
      if (result.confused_with) {
        add('confused_with.word', result.confused_with.word);
        add('confused_with.contrast', result.confused_with.contrast);
      }
    } else if (result.mode === 'grammar') {
      add('real_meaning', result.real_meaning);
      if (result.formation) {
        add('formation.rule', result.formation.rule);
        add('formation.common_mistake', result.formation.common_mistake);
      }
      if (result.confused_with) {
        add('confused_with.pattern', result.confused_with.pattern);
        add('confused_with.contrast', result.confused_with.contrast);
      }
      add('bunpro_tip', result.bunpro_tip);
    }
    // confusion_set members (optional, additive): the family comparison the
    // learner reads — word/pattern + use_when + example all carry ruby.
    (result.confusion_set || []).forEach((m, i) => {
      add(`confusion_set[${i}].${result.mode === 'grammar' ? 'pattern' : 'word'}`,
        m && (result.mode === 'grammar' ? m.pattern : m.word));
      add(`confusion_set[${i}].use_when`, m && m.use_when);
      add(`confusion_set[${i}].example`, m && m.example);
    });
  }

  (result.sentences || []).forEach((s, i) => {
    add(`sentences[${i}].jp`, s && s.jp);
    // JJ notes are explanation prose; same exemption as JJ prose fields above
    if (includeNotes && !result._jj) add(`sentences[${i}].notes`, s && s.notes);
  });

  return pairs;
}

/* ── CHECK: every kanji is wrapped in ruby furigana ── */
function everyKanjiHasRuby(result) {
  const messages = [];
  for (const { field, text } of prosePairs(result, { includeNotes: true })) {
    const stray = strayKanji(text);
    if (stray.length) {
      messages.push(`${field}: ${stray.length} un-ruby'd kanji (${[...new Set(stray)].join('')})`);
    }
  }
  return { pass: messages.length === 0, messages };
}

/* ── CHECK: result matches the mode's output contract ── */
function matchesContract(result) {
  const messages = [];
  const need = (cond, msg) => { if (!cond) messages.push(msg); };

  need(result.mode === 'vocab' || result.mode === 'grammar', `unknown mode: ${result.mode}`);
  need(Array.isArray(result.sentences), 'sentences is not an array');

  if (result.mode === 'vocab') {
    ['word', 'reading', 'core_meaning', 'dont_use', 'frequency', 'anki_hint']
      .forEach(f => need(typeof result[f] === 'string' && result[f].trim(), `missing/empty ${f}`));
    need(result.pitch_accent && typeof result.pitch_accent === 'object', 'missing pitch_accent');
    need(Number.isInteger(result.pitch_accent?.number) && result.pitch_accent.number >= 0,
      'pitch_accent.number must be non-negative integer');
    need(['平板', '頭高', '中高', '尾高', 'heiban', 'atamadaka', 'nakadaka', 'odaka']
      .includes(result.pitch_accent?.label),
      `invalid pitch_accent.label: "${result.pitch_accent?.label}"`);
    need(result.confused_with && result.confused_with.word, 'missing confused_with.word');
    need(result.confused_with?.reading !== undefined, 'missing confused_with.reading');
  } else if (result.mode === 'grammar') {
    ['pattern', 'real_meaning', 'bunpro_tip']
      .forEach(f => need(typeof result[f] === 'string' && result[f].trim(), `missing/empty ${f}`));
    need(result.formation && result.formation.rule && result.formation.common_mistake,
      'missing formation.rule/common_mistake');
    need(result.confused_with && result.confused_with.pattern, 'missing confused_with.pattern');
  }

  (result.sentences || []).forEach((s, i) => {
    need(s && s.jp, `sentences[${i}] missing jp`);
    need(s && s.translation, `sentences[${i}] missing translation`);
    need(s && s.register, `sentences[${i}] missing register`);
  });

  return { pass: messages.length === 0, messages };
}

/* ── CHECK: exact sentence count (vocab 5, grammar 4) ── */
function sentenceCount(result) {
  const want = result.mode === 'grammar' ? 4 : 5;
  const got = (result.sentences || []).length;
  return got === want
    ? { pass: true, messages: [] }
    : { pass: false, messages: [`expected ${want} sentences, got ${got}`] };
}

/* ── CHECK: registers are valid and varied (≥3 distinct) ── */
function distinctRegisters(result) {
  const allowed = REGISTERS[result.mode] || [];
  const messages = [];
  const used = (result.sentences || []).map(s => s && s.register);
  used.forEach((r, i) => {
    if (r && !allowed.includes(r)) messages.push(`sentences[${i}] invalid register "${r}"`);
  });
  const distinct = new Set(used.filter(Boolean));
  if (distinct.size < 3) {
    messages.push(`only ${distinct.size} distinct register(s): ${[...distinct].join(', ') || 'none'}`);
  }
  return { pass: messages.length === 0, messages };
}

/* ── CHECK: confused_with is populated with a real contrast ── */
function confusedWithPopulated(result) {
  const cw = result.confused_with;
  const messages = [];
  if (!cw || typeof cw !== 'object') {
    messages.push('confused_with missing');
  } else {
    const key = result.mode === 'grammar' ? cw.pattern : cw.word;
    if (!key || !String(key).trim()) messages.push('confused_with has no word/pattern');
    if (!cw.contrast || !String(cw.contrast).trim()) messages.push('confused_with.contrast empty');
  }
  return { pass: messages.length === 0, messages };
}

/* ── CHECK: confusion_set, when present, is a well-formed family comparison ──
   Additive/optional field: a result WITHOUT confusion_set passes (keeps pre-
   feature snapshots and cached history valid). When present it must be a 2–3
   member array whose members each carry the headword key (word for vocab,
   pattern for grammar) and a use_when line. Ruby on members is covered by
   everyKanjiHasRuby via prosePairs; this check is structure only. */
function confusionSetWellFormed(result) {
  const cs = result.confusion_set;
  if (cs === undefined) return { pass: true, messages: [] };
  const messages = [];
  if (!Array.isArray(cs)) {
    return { pass: false, messages: ['confusion_set is not an array'] };
  }
  if (cs.length < 2 || cs.length > 3) {
    messages.push(`confusion_set should have 2–3 members, got ${cs.length}`);
  }
  const memberKey = result.mode === 'grammar' ? 'pattern' : 'word';
  cs.forEach((m, i) => {
    if (!m || typeof m !== 'object') { messages.push(`confusion_set[${i}] not an object`); return; }
    if (!m[memberKey] || !String(m[memberKey]).trim()) messages.push(`confusion_set[${i}] missing ${memberKey}`);
    if (!m.use_when || !String(m.use_when).trim()) messages.push(`confusion_set[${i}] missing use_when`);
  });
  return { pass: messages.length === 0, messages };
}

/* ── CHECK (JJ only): prose sentences must stay under 80 chars ──
   Fires only when result._jj === true (set by lookup() when opts.jj is true).
   Strips ruby tags before measuring so markup doesn't inflate the count. */
function jjSentenceLength(result) {
  if (!result._jj) return { pass: true, messages: [] };
  const fields = result.mode === 'vocab'
    ? [result.core_meaning, result.dont_use, result.frequency, result.anki_hint,
       result.confused_with?.contrast]
    : [result.real_meaning, result.formation?.rule, result.formation?.common_mistake,
       result.confused_with?.contrast, result.bunpro_tip];
  const long = [];
  for (const f of fields) {
    if (!f) continue;
    const stripped = f.replace(/<[^>]+>/g, '');
    for (const sentence of stripped.split(/[。！？]/)) {
      if (sentence.trim().length > 80) long.push(sentence.trim().slice(0, 40) + '…');
    }
  }
  return {
    pass: long.length === 0,
    messages: long.map(s => `JJ prose sentence too long (>60 chars): ${s}`),
  };
}

const CHECKS = [
  { name: 'kanji-ruby', run: everyKanjiHasRuby },
  { name: 'contract', run: matchesContract },
  { name: 'sentence-count', run: sentenceCount },
  { name: 'registers', run: distinctRegisters },
  { name: 'confused-with', run: confusedWithPopulated },
  { name: 'confusion-set', run: confusionSetWellFormed },
  { name: 'jj-sentence-length', run: jjSentenceLength },
];

/* Run every check against a result. Returns [{ name, pass, messages }]. */
function runChecks(result) {
  return CHECKS.map(c => ({ name: c.name, ...c.run(result) }));
}

module.exports = {
  runChecks,
  CHECKS,
  // exported for unit testing the validators themselves
  strayKanji,
  everyKanjiHasRuby,
  matchesContract,
  sentenceCount,
  distinctRegisters,
  confusedWithPopulated,
  confusionSetWellFormed,
  jjSentenceLength,
};
