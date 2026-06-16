/**
 * eval/golden.js — the golden set of lookups the harness exercises.
 *
 * `mode` is the EXPECTED mode (also a soft check on detectMode in lookup.js).
 * Cases target the learner's documented gaps: the 見る/見える/見せる family,
 * verbs with multiple senses, abstract words used as grammatical constructions,
 * and a spread of N3-range grammar patterns. A couple of plain N4 words act as
 * a baseline.
 *
 * Grammar patterns are written with the ～ prefix so detectMode routes them to
 * grammar mode (the same way the app and CLI do).
 */
module.exports = [
  // ── Vocab: the perception family + multi-sense verbs ──
  { input: '見る', mode: 'vocab' },
  { input: '見える', mode: 'vocab' },
  { input: '見せる', mode: 'vocab' },
  { input: '上がる', mode: 'vocab' },
  { input: '入れる', mode: 'vocab' },
  { input: '思う', mode: 'vocab' },   // think family (思う/考える) — exercises confusion_set; kanji-headed so it routes to vocab

  // ── Vocab: abstract words / grammatical-construction nouns ──
  { input: '物', mode: 'vocab' },
  { input: '事', mode: 'vocab' },
  { input: 'よう', mode: 'vocab' },   // abstract noun; also grammatical (見るようだ) — distinct from ～ように
  { input: '所', mode: 'vocab' },    // noun form as kanji — bare ところ (hiragana) triggers grammar heuristic

  // ── Vocab: nuance-heavy everyday words + N4 baseline ──
  { input: '結構', mode: 'vocab' },
  { input: '適当', mode: 'vocab' },
  { input: '大丈夫', mode: 'vocab' },

  // ── Grammar: N3-range patterns ──
  { input: '～かもしれない', mode: 'grammar' }, // high-frequency N4; conditional nuance often dropped
  { input: '～てもいい', mode: 'grammar' },     // N4 permission; confusion with ～てはいけない
  { input: '～たことがある', mode: 'grammar' }, // N4 experience pattern; modal nuance
  { input: '～たら', mode: 'grammar' },          // conditional family (～たら/～ば/～と/～なら) — exercises confusion_set
  { input: '～てしまう', mode: 'grammar' },
  { input: '～ておく', mode: 'grammar' },
  { input: '～ように', mode: 'grammar' },
  { input: '～ところ', mode: 'grammar' },
  { input: '～わけだ', mode: 'grammar' },
  { input: '～はず', mode: 'grammar' },
  { input: '～ながら', mode: 'grammar' },
  { input: '～そうだ', mode: 'grammar' },

  // ── JJ mode: representative cases to guard conversational register ──
  { input: '見る', mode: 'vocab', jj: true },
  { input: '大丈夫', mode: 'vocab', jj: true },
  { input: '～てしまう', mode: 'grammar', jj: true },
];
