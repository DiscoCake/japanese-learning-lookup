/**
 * lookup.js — core logic for Japanese Study Companion
 * No framework dependencies. Import this from server.js or cli.js.
 *
 * Usage:
 *   const { lookup } = require('./lookup');
 *   const result = await lookup('見る');          // vocab mode
 *   const result = await lookup('～てしまう');    // grammar mode
 */
require('dotenv').config();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';

/* ── MODE DETECTION ── */
function detectMode(input) {
  const trimmed = input.trim();
  const grammarSignals = ['～', '〜', 'ば', 'たら', 'なら', 'ても', 'ても',
    'ために', 'ように', 'ながら', 'てから', 'たり', 'し', 'のに', 'から',
    'ので', 'けど', 'が', 'は〜が', 'という', 'そう', 'らしい', 'みたい'];
  if (grammarSignals.some(s => trimmed.startsWith(s))) return 'grammar';
  if (trimmed.includes('〜') || trimmed.includes('～')) return 'grammar';
  // heuristic: if input contains hiragana-only grammatical particles with no kanji/katakana noun → grammar
  if (/^[ぁ-ん]+$/.test(trimmed) && trimmed.length > 2) return 'grammar';
  return 'vocab';
}

/* ── SYSTEM PROMPTS ── */
const VOCAB_SYSTEM = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner uses Anki (Kaishi 1.5k deck — one example sentence per word), BunPro, and Migaku.
Their single-sentence Anki cards feel thin, especially for abstract words or words with multiple uses.

OUTPUT: valid JSON only — no markdown fences, no extra text.

{
  "word": "the word as given",
  "reading": "hiragana reading",
  "mode": "vocab",
  "core_meaning": "1-2 sentence honest description of what this word actually means in use — not just a dictionary gloss",
  "sentences": [
    {
      "jp": "example sentence with ruby furigana on ALL kanji: <ruby>食<rt>た</rt></ruby>べる",
      "translation": "natural English translation",
      "register": "casual | standard | formal | written",
      "notes": "what this sentence demonstrates about the word's usage (optional, 1 sentence)"
    }
  ],
  "dont_use": "2-3 sentences on when NOT to use this word, common learner mistakes, situations where a different word is more natural",
  "confused_with": {
    "word": "most commonly confused word/expression",
    "reading": "reading of confused word",
    "contrast": "2-3 sentences clearly explaining the difference with a concrete example"
  },
  "frequency": "honest note on register and frequency: common in daily speech / mostly written / formal contexts / regional / etc.",
  "anki_hint": "one sentence a learner could add to the back of their Anki card to remember the key usage nuance"
}

SENTENCE RULES:
- Generate exactly 5 sentences
- Vary register meaningfully: at least one casual (friends/family), one standard, one more formal or written
- Show the word's RANGE — different collocations, different contexts, not just the same idea repeated
- For words with multiple senses (e.g. 上がる), cover the main senses across the sentences
- If the word is commonly used as a grammatical construction (e.g. ところ、もの、わけ), at least 2 sentences must show the grammatical use
- ALL kanji in Japanese output must have ruby furigana tags`;

const GRAMMAR_SYSTEM = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner uses BunPro for grammar SRS. They find textbook definitions too dry and want to understand
what a grammar point actually DOES — the feeling/nuance it conveys — not just its structural definition.

OUTPUT: valid JSON only — no markdown fences, no extra text.

{
  "pattern": "the grammar pattern as given",
  "mode": "grammar",
  "real_meaning": "2-3 sentences on what this pattern actually expresses — the feeling, speaker intent, or pragmatic function beyond the textbook gloss. Be specific and honest about nuance.",
  "formation": {
    "rule": "clear formation rule: what verb form / noun / adjective form it attaches to, with an example of each",
    "common_mistake": "the most common formation mistake learners make, with example of the wrong form and the correct form"
  },
  "sentences": [
    {
      "jp": "example sentence with ruby furigana on ALL kanji: <ruby>食<rt>た</rt></ruby>べる",
      "translation": "natural English translation",
      "register": "casual | standard | formal",
      "notes": "what this sentence demonstrates about nuance or usage (1 sentence)"
    }
  ],
  "confused_with": {
    "pattern": "most commonly confused grammar pattern",
    "contrast": "3-4 sentences clearly explaining the difference. Include a minimal pair — two sentences that are nearly identical but use each pattern, showing when you'd choose one over the other."
  },
  "bunpro_tip": "1-2 sentences of advice specifically for remembering/drilling this in BunPro — what mental model or mnemonic helps"
}

SENTENCE RULES:
- Generate exactly 4 sentences
- MUST cover: one clearly casual, one standard/polite, one formal or written
- Fourth sentence: a tricky or nuanced use that surprises learners
- ALL kanji in Japanese output must have ruby furigana tags`;

/* ── MAIN LOOKUP FUNCTION ── */
async function lookup(input) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — check your .env file');
  }
  const mode = detectMode(input.trim());
  const system = mode === 'grammar' ? GRAMMAR_SYSTEM : VOCAB_SYSTEM;
  const userMsg = mode === 'grammar'
    ? `Grammar point to analyze: ${input.trim()}`
    : `Word to analyze: ${input.trim()}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  if (!raw) throw new Error('Empty response from API');

  let result;
  try {
    result = JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse API response as JSON: ' + raw.slice(0, 200));
  }

  result.mode = mode;
  result.input = input.trim();
  result.timestamp = new Date().toISOString();
  return result;
}

/* ── TSV EXPORT HELPER ── */
function toAnkiTSV(result) {
  const rows = [];
  if (result.mode === 'vocab') {
    result.sentences.forEach(s => {
      rows.push([result.word, result.reading, s.jp.replace(/<[^>]+>/g, ''), s.translation].join('\t'));
    });
  } else {
    result.sentences.forEach(s => {
      rows.push([result.pattern, '', s.jp.replace(/<[^>]+>/g, ''), s.translation].join('\t'));
    });
  }
  return rows.join('\n');
}

module.exports = { lookup, detectMode, toAnkiTSV };
