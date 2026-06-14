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

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const { lookupPitch } = require('./pitch');

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

IMPORTANT: Every Japanese kanji character (CJK ideograph) in your JSON response must be wrapped in ruby furigana tags: <ruby>漢字<rt>かんじ</rt></ruby>. English words, Roman letters, and proper nouns written in the Latin alphabet must NEVER have ruby tags — furigana is only for actual kanji characters.

If the user message includes a "Context sentence" line, bias your core_meaning explanation and first 1–2 example sentences to reflect how the word is used in that specific context.

OUTPUT: valid JSON only — no markdown fences, no extra text.

{
  "word": "the word as given",
  "reading": "hiragana reading",
  "mode": "vocab",
  "pitch_accent": {
    "number": 0,
    "label": "平板 | 頭高 | 中高 | 尾高",
    "pattern": "LHH — H/L per mora of the reading (e.g. LHL for 3-mora 中高 word)"
  },
  "core_meaning": "1-2 sentence honest description of what this word actually means in use — not just a dictionary gloss (include ruby furigana on all kanji)",
  "sentences": [
    {
      "jp": "example sentence with ruby furigana on ALL kanji: <ruby>食<rt>た</rt></ruby>べる",
      "translation": "natural English translation",
      "register": "casual | standard | formal | written",
      "notes": "what this sentence demonstrates about the word's usage (optional, 1 sentence)"
    }
  ],
  "dont_use": "2-3 sentences on when NOT to use this word, common learner mistakes, situations where a different word is more natural (include ruby furigana on all kanji)",
  "confused_with": {
    "word": "most commonly confused word/expression (ruby on kanji if any)",
    "reading": "reading of confused word",
    "contrast": "2-3 sentences clearly explaining the difference with a concrete example (include ruby furigana on all kanji)"
  },
  "frequency": "honest note on register and frequency: common in daily speech / mostly written / formal contexts / regional / etc. (include ruby furigana on all kanji)",
  "anki_hint": "one sentence a learner could add to the back of their Anki card to remember the key usage nuance (include ruby furigana on all kanji)"
}

SENTENCE RULES:
- Generate exactly 5 sentences
- Vary register meaningfully: at least one casual (friends/family), one standard, one more formal or written
- Show the word's RANGE — different collocations, different contexts, not just the same idea repeated
- For words with multiple senses (e.g. 上がる), cover the main senses across the sentences
- If the word is commonly used as a grammatical construction (e.g. ところ、もの、わけ), at least 2 sentences must show the grammatical use
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text`;

const GRAMMAR_SYSTEM = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner uses BunPro for grammar SRS. They find textbook definitions too dry and want to understand
what a grammar point actually DOES — the feeling/nuance it conveys — not just its structural definition.

IMPORTANT: Every Japanese kanji character (CJK ideograph) in your JSON response must be wrapped in ruby furigana tags: <ruby>漢字<rt>かんじ</rt></ruby>. English words, Roman letters, and proper nouns written in the Latin alphabet must NEVER have ruby tags — furigana is only for actual kanji characters.

If the user message includes a "Context sentence" line, bias your real_meaning explanation and first example sentence to reflect how the pattern is used in that specific context.

OUTPUT: valid JSON only — no markdown fences, no extra text.

{
  "pattern": "the grammar pattern as given",
  "mode": "grammar",
  "real_meaning": "2-3 sentences on what this pattern actually expresses — the feeling, speaker intent, or pragmatic function beyond the textbook gloss. Be specific and honest about nuance. (include ruby furigana on all kanji)",
  "formation": {
    "rule": "clear formation rule: what verb form / noun / adjective form it attaches to, with an example of each (include ruby furigana on all kanji)",
    "common_mistake": "the most common formation mistake learners make, with example of the wrong form and the correct form (include ruby furigana on all kanji)"
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
    "pattern": "most commonly confused grammar pattern (ruby on kanji if any)",
    "contrast": "3-4 sentences clearly explaining the difference. Include a minimal pair — two sentences that are nearly identical but use each pattern, showing when you'd choose one over the other. (include ruby furigana on all kanji)"
  },
  "bunpro_tip": "1-2 sentences of advice specifically for remembering/drilling this in BunPro — what mental model or mnemonic helps (include ruby furigana on all kanji)"
}

SENTENCE RULES:
- Generate exactly 4 sentences
- MUST cover: one clearly casual, one standard/polite, one formal or written
- Fourth sentence: a tricky or nuanced use that surprises learners
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text`;

/* ── J-J SYSTEM PROMPTS ── */
const VOCAB_SYSTEM_JJ = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner wants explanations entirely in simple Japanese, like a 国語辞典 (Japanese-to-Japanese dictionary).

IMPORTANT: Every Japanese kanji character (CJK ideograph) in your JSON response must be wrapped in ruby furigana tags: <ruby>漢字<rt>かんじ</rt></ruby>. English words, Roman letters, and proper nouns written in the Latin alphabet must NEVER have ruby tags.

全ての説明フィールドをJLPT N4–N5レベルのやさしい日本語で書いてください。短くシンプルな文を使い、難しい語彙や複雑な文型は避けてください。sentences の translation フィールドだけは英語で書いてください。

If the user message includes a "Context sentence" line, bias your explanations to reflect that specific usage.

OUTPUT: valid JSON only — no markdown fences, no extra text.

{
  "word": "the word as given",
  "reading": "hiragana reading",
  "mode": "vocab",
  "pitch_accent": {
    "number": 0,
    "label": "平板 | 頭高 | 中高 | 尾高",
    "pattern": "LHH — H/L per mora of the reading"
  },
  "core_meaning": "この言葉の意味・使い方を1〜2文で説明してください（やさしい日本語で、全ての漢字にふりがなをつけてください）",
  "sentences": [
    {
      "jp": "例文。全ての漢字にふりがな: <ruby>食<rt>た</rt></ruby>べる",
      "translation": "natural English translation",
      "register": "casual | standard | formal | written",
      "notes": "この例文でこの言葉のどんな使い方を見せているか1文で（日本語で、ふりがなつき）"
    }
  ],
  "dont_use": "この言葉を使わないほうがいい場面や、よくある間違いを2〜3文で（やさしい日本語で、全ての漢字にふりがなをつけてください）",
  "confused_with": {
    "word": "most commonly confused word (ruby on kanji if any)",
    "reading": "reading of confused word",
    "contrast": "この言葉と混同しやすい表現の違いを2〜3文で。具体的な例を使ってください（やさしい日本語で、全ての漢字にふりがなをつけてください）"
  },
  "frequency": "この言葉がよく使われる場面やレジスターについて（やさしい日本語で、全ての漢字にふりがなをつけてください）",
  "anki_hint": "この言葉の大切なポイントを1文でまとめてください（やさしい日本語で、全ての漢字にふりがなをつけてください）"
}

SENTENCE RULES:
- Generate exactly 5 sentences
- Vary register meaningfully: at least one casual (friends/family), one standard, one more formal or written
- Show the word's RANGE — different collocations, different contexts, not just the same idea repeated
- For words with multiple senses (e.g. 上がる), cover the main senses across the sentences
- If the word is commonly used as a grammatical construction (e.g. ところ、もの、わけ), at least 2 sentences must show the grammatical use
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text`;

const GRAMMAR_SYSTEM_JJ = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner wants explanations entirely in simple Japanese, like a 国語辞典 (Japanese-to-Japanese grammar guide).

IMPORTANT: Every Japanese kanji character (CJK ideograph) in your JSON response must be wrapped in ruby furigana tags: <ruby>漢字<rt>かんじ</rt></ruby>. English words, Roman letters, and proper nouns written in the Latin alphabet must NEVER have ruby tags.

全ての説明フィールドをJLPT N4–N5レベルのやさしい日本語で書いてください。短くシンプルな文を使い、難しい語彙や複雑な文型は避けてください。sentences の translation フィールドだけは英語で書いてください。

If the user message includes a "Context sentence" line, bias your explanations to reflect that specific usage.

OUTPUT: valid JSON only — no markdown fences, no extra text.

{
  "pattern": "the grammar pattern as given",
  "mode": "grammar",
  "real_meaning": "この文法パターンが本当に表す意味・ニュアンスを2〜3文で。教科書的な定義ではなく、実際の感覚や使い方を教えてください（やさしい日本語で、全ての漢字にふりがなをつけてください）",
  "formation": {
    "rule": "接続のルールを分かりやすく説明してください。動詞・名詞・形容詞など、それぞれの形を例と一緒に書いてください（やさしい日本語、ふりがなつき）",
    "common_mistake": "よくある間違いを1つ、間違いの例と正しい例を使って説明してください（やさしい日本語、ふりがなつき）"
  },
  "sentences": [
    {
      "jp": "例文。全ての漢字にふりがな: <ruby>食<rt>た</rt></ruby>べる",
      "translation": "natural English translation",
      "register": "casual | standard | formal",
      "notes": "この例文でこの文法のどんなニュアンスを見せているか1文で（日本語で、ふりがなつき）"
    }
  ],
  "confused_with": {
    "pattern": "most commonly confused grammar pattern (ruby on kanji if any)",
    "contrast": "この文法と混同しやすいパターンの違いを3〜4文で。ほぼ同じ状況での2つの文を作って、使い分けを見せてください（やさしい日本語、ふりがなつき）"
  },
  "bunpro_tip": "BunProでこの文法を覚えるコツを1〜2文で（やさしい日本語、ふりがなつき）"
}

SENTENCE RULES:
- Generate exactly 4 sentences
- MUST cover: one clearly casual, one standard/polite, one formal or written
- Fourth sentence: a tricky or nuanced use that surprises learners
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text`;

/* ── MAIN LOOKUP FUNCTION ── */
async function lookup(input, opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — check your .env file');
  }
  const mode = opts.forceMode || detectMode(input.trim());
  const system = opts.jj
    ? (mode === 'grammar' ? GRAMMAR_SYSTEM_JJ : VOCAB_SYSTEM_JJ)
    : (mode === 'grammar' ? GRAMMAR_SYSTEM : VOCAB_SYSTEM);
  const contextLine = opts.context ? `\n\nContext sentence: ${opts.context}` : '';
  const userMsg = mode === 'grammar'
    ? `Grammar point to analyze: ${input.trim()}${contextLine}`
    : `Word to analyze: ${input.trim()}${contextLine}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5000,
      output_config: { effort: 'medium' },
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
  if (result.mode === 'vocab' && result.word) {
    const dictPitch = lookupPitch(result.word, result.reading);
    if (dictPitch) result.pitch_accent = dictPitch;
  }
  return result;
}

/* ── PASTE MODE: WORD IDENTIFICATION ── */
async function identifyWords(text) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      output_config: { effort: 'low' },
      system: `You are a Japanese language assistant for an N4→N3 learner.
Given Japanese text, identify 5–12 words or short expressions worth explaining.
Prioritise: N3-range vocabulary, words with multiple senses or nuance, verbs in unusual forms, grammar constructions acting as nouns.
Exclude: particles (は、が、を、に、で、と、も、か、な、の), ultra-common N5/N4 words (です、ます、ある、する、いる、言う、行く、来る、見る、聞く、食べる、人、時、日、年), names of people/places.
For grammar patterns output the dictionary pattern form starting with ～ (e.g. ～てしまう, ～ている).
Also include the complete sentence (from the input text) where the word or pattern appears, as a "sentence" field.
Return ONLY a JSON array — no markdown, no explanation:
[{"word":"単語","reading":"たんご","reason":"one brief English phrase explaining why this is worth knowing","sentence":"the complete source sentence containing this word"}]`,
      messages: [{ role: 'user', content: text }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error?.message || 'unknown'}`);
  }
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); } catch { return []; }
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

/* ── STREAMING LOOKUP ── */
async function* lookupStream(input, opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set — check your .env file');
  const mode = opts.forceMode || detectMode(input.trim());
  const system = opts.jj
    ? (mode === 'grammar' ? GRAMMAR_SYSTEM_JJ : VOCAB_SYSTEM_JJ)
    : (mode === 'grammar' ? GRAMMAR_SYSTEM : VOCAB_SYSTEM);
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
      max_tokens: 5000,
      output_config: { effort: 'medium' },
      stream: true,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        let event;
        try { event = JSON.parse(raw); } catch { continue; }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          accumulated += event.delta.text;
          yield { type: 'chunk', text: event.delta.text };
        } else if (event.type === 'error') {
          throw new Error(`API stream error: ${event.error?.message || 'unknown'}`);
        } else if (event.type === 'message_delta' && event.delta?.stop_reason &&
                   event.delta.stop_reason !== 'end_turn') {
          throw new Error(`Stream stopped early: ${event.delta.stop_reason}`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const cleaned = accumulated.replace(/```json|```/g, '').trim();
  let result;
  try { result = JSON.parse(cleaned); }
  catch (e) { throw new Error('Failed to parse streamed JSON: ' + cleaned.slice(0, 200)); }
  result.mode = mode;
  result.input = input.trim();
  result.timestamp = new Date().toISOString();
  if (result.mode === 'vocab' && result.word) {
    const dictPitch = lookupPitch(result.word, result.reading);
    if (dictPitch) result.pitch_accent = dictPitch;
  }
  yield { type: 'done', result };
}

module.exports = { lookup, lookupStream, toAnkiTSV, identifyWords };
