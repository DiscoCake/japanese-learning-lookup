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
const { repairResult } = require('./furigana');

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
      "notes": "what this sentence demonstrates about the word's usage — 1 sentence (include ruby furigana on any kanji)"
    }
  ],
  "dont_use": "2-3 sentences on when NOT to use this word, common learner mistakes, situations where a different word is more natural (include ruby furigana on all kanji)",
  "confused_with": {
    "word": "most commonly confused word/expression (ruby on kanji if any)",
    "reading": "reading of confused word",
    "contrast": "2-3 sentences: show the typical learner MISTAKE (reaching for this word where the confused one is natural), then say why it sounds off and which to use — with a concrete example (include ruby furigana on all kanji)"
  },
  "confusion_set": [
    {
      "word": "a member of the confusion family. Build a 2–3 member set: the FIRST member MUST be the looked-up word itself, then its 1–2 closest confusables that learners genuinely mix up (e.g. 見る/見える/見せる, あげる/くれる/もらう, 思う/考える) — ruby on all kanji",
      "reading": "hiragana reading of this member",
      "use_when": "ONE short line: exactly when you reach for THIS member over the others in the set (ruby on all kanji)",
      "example": "ONE short, natural example sentence using this member — keep it a quick-glance contrast, ruby on ALL kanji"
    }
  ],
  "frequency": "honest note on register and frequency: common in daily speech / mostly written / formal contexts / regional / etc. (include ruby furigana on all kanji)",
  "anki_hint": "one sentence a learner could add to the back of their Anki card to remember the key usage nuance (include ruby furigana on all kanji)"
}

SENTENCE RULES:
- Generate exactly 5 sentences
- NATURALNESS over textbook polish: write each sentence the way a native actually says it in that register — natural collocations and casual contractions/ellipsis (〜ちゃう、〜とく、〜んだ、dropped particles) in casual registers, not stiff scripted forms. Keep the register label honest about what the Japanese actually is.
- Vary register meaningfully: at least one casual (friends/family), one standard, one more formal or written
- Show the word's RANGE — different collocations, different contexts, not just the same idea repeated
- For words with multiple senses (e.g. 上がる), cover the main senses across the sentences
- If the word is commonly used as a grammatical construction (e.g. ところ、もの、わけ), at least 2 sentences must show the grammatical use
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text
- This includes sentences[].notes — if a note contains Japanese, every kanji needs <ruby> tags`;

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
      "notes": "what this sentence demonstrates about nuance or usage — 1 sentence (include ruby furigana on any kanji)"
    }
  ],
  "confused_with": {
    "pattern": "most commonly confused grammar pattern (ruby on kanji if any)",
    "contrast": "3-4 sentences explaining the difference. MUST include a true minimal pair: two sentences IDENTICAL except for the pattern (same subject, object, tense, register) so only the grammar differs — then say when you'd choose each. (include ruby furigana on all kanji)"
  },
  "confusion_set": [
    {
      "pattern": "a member of the confusion family. Build a 2–3 member set: the FIRST member MUST be the looked-up pattern itself, then its 1–2 closest confusables that learners genuinely mix up (e.g. ～ば/～たら/～と/～なら, ～ている/～てある, ～ようだ/～そうだ/～らしい) — ruby on any kanji",
      "use_when": "ONE short line: exactly when you reach for THIS pattern over the others in the set (ruby on all kanji)",
      "example": "ONE short, natural example sentence using this pattern — keep it a quick-glance contrast, ruby on ALL kanji"
    }
  ],
  "bunpro_tip": "1-2 sentences of advice specifically for remembering/drilling this in BunPro — what mental model or mnemonic helps (include ruby furigana on all kanji)"
}

SENTENCE RULES:
- Generate exactly 4 sentences
- NATURALNESS over textbook polish: write each sentence the way a native actually says it in that register — natural collocations and casual contractions/ellipsis (〜ちゃう、〜とく、〜んだ、dropped particles) in casual registers, not stiff scripted forms. Keep the register label honest about what the Japanese actually is.
- MUST cover: one clearly casual, one standard/polite, one formal or written
- Fourth sentence: a tricky or nuanced use that surprises learners
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text
- This includes sentences[].notes — if a note contains Japanese, every kanji needs <ruby> tags`;

/* ── J-J SYSTEM PROMPTS ── */
const VOCAB_SYSTEM_JJ = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner wants explanations entirely in simple Japanese — like a friendly Japanese teacher speaking naturally to a beginner, approachable and clear, not formal or dictionary-like.

IMPORTANT: Every Japanese kanji character (CJK ideograph) in your JSON response must be wrapped in ruby furigana tags: <ruby>漢字<rt>かんじ</rt></ruby>. English words, Roman letters, and proper nouns written in the Latin alphabet must NEVER have ruby tags.

全ての説明フィールドをJLPT N4–N5レベルのやさしい日本語で書いてください。
日本語を勉強している友達に話しかけるように、自然で親しみやすい口調で説明してください。教科書や辞書のような固い文体は使わないでください。

【文の長さ】1文は40文字以内を目安に。長くなりそうなら2文に分けてください。
【語彙】説明の中に、このような難しい言葉は使わないでください：
　× 概念・抽象的・体系・論理的・観点・手段・状況（N2以上の漢字語）
　○ 使う・意味・方法・場合・感じ・気持ち（よく使う言葉）
【文型】説明の文で ～に際して・～にほかならない・～を踏まえて・～によって（理由）などのN2以上の文型は使わないでください。
【ふりがな】全ての漢字に必ず<ruby>漢字<rt>よみ</rt></ruby>のタグをつけてください。「使」「場面」「残念」「日本」「方法」など、よく知られている漢字も例外なく必要です。

sentences の translation フィールドだけは英語で書いてください。

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
    "contrast": "この言葉と混同しやすい表現の違いを2〜3文で。よくある間違い（この言葉を使ってしまう場面）を見せて、なぜ変か、どちらを使うかを説明してください。具体的な例つき（やさしい日本語で、全ての漢字にふりがなをつけてください）"
  },
  "confusion_set": [
    {
      "word": "まちがえやすい言葉のグループ。2〜3個のメンバーを作ってください。最初のメンバーは必ず調べている言葉そのもの、そのあとに、よくまちがえる近い言葉を1〜2個（例：見る/見える/見せる、あげる/くれる/もらう）。全ての漢字にふりがなをつけてください",
      "reading": "このメンバーのひらがなの読み方",
      "use_when": "どんな時にこのメンバーを使うか、短く1文で（やさしい日本語、全ての漢字にふりがなをつけてください）",
      "example": "このメンバーを使った短くて自然な例文を1つ（ぱっと見て比べられるように短く、全ての漢字にふりがなをつけてください）"
    }
  ],
  "frequency": "この言葉がよく使われる場面やレジスターについて（やさしい日本語で、全ての漢字にふりがなをつけてください）",
  "anki_hint": "この言葉の大切なポイントを1文でまとめてください（やさしい日本語で、全ての漢字にふりがなをつけてください）"
}

SENTENCE RULES:
- Generate exactly 5 sentences
- NATURALNESS over textbook polish: write each sentence the way a native actually says it in that register — natural collocations and casual contractions/ellipsis (〜ちゃう、〜とく、〜んだ、dropped particles) in casual registers, not stiff scripted forms. Keep the register label honest about what the Japanese actually is.
- Vary register meaningfully: at least one casual (friends/family), one standard, one more formal or written
- Show the word's RANGE — different collocations, different contexts, not just the same idea repeated
- For words with multiple senses (e.g. 上がる), cover the main senses across the sentences
- If the word is commonly used as a grammatical construction (e.g. ところ、もの、わけ), at least 2 sentences must show the grammatical use
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text
- This includes sentences[].notes — if a note contains Japanese, every kanji needs <ruby> tags`;

const GRAMMAR_SYSTEM_JJ = `You are a Japanese language expert helping an early-intermediate learner (solid N4, approaching N3).
The learner wants explanations entirely in simple Japanese — like a friendly Japanese teacher speaking naturally to a beginner, approachable and clear, not formal or dictionary-like.

IMPORTANT: Every Japanese kanji character (CJK ideograph) in your JSON response must be wrapped in ruby furigana tags: <ruby>漢字<rt>かんじ</rt></ruby>. English words, Roman letters, and proper nouns written in the Latin alphabet must NEVER have ruby tags.

全ての説明フィールドをJLPT N4–N5レベルのやさしい日本語で書いてください。
日本語を勉強している友達に話しかけるように、自然で親しみやすい口調で説明してください。教科書や辞書のような固い文体は使わないでください。

【文の長さ】1文は40文字以内を目安に。長くなりそうなら2文に分けてください。
【語彙】説明の中に、このような難しい言葉は使わないでください：
　× 概念・抽象的・体系・論理的・観点・手段・状況（N2以上の漢字語）
　○ 使う・意味・方法・場合・感じ・気持ち（よく使う言葉）
【文型】説明の文で ～に際して・～にほかならない・～を踏まえて・～によって（理由）などのN2以上の文型は使わないでください。
【ふりがな】全ての漢字に必ず<ruby>漢字<rt>よみ</rt></ruby>のタグをつけてください。「使」「場面」「残念」「日本」「方法」など、よく知られている漢字も例外なく必要です。

sentences の translation フィールドだけは英語で書いてください。

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
    "contrast": "この文法と混同しやすいパターンの違いを3〜4文で。主語・目的語・時制・レジスターが同じで、文法だけが違う2つの文（ミニマルペア）を作って、どちらをいつ使うか見せてください（やさしい日本語、ふりがなつき）"
  },
  "confusion_set": [
    {
      "pattern": "まちがえやすい文法のグループ。2〜3個のメンバーを作ってください。最初のメンバーは必ず調べている文法そのもの、そのあとに、よくまちがえる近いパターンを1〜2個（例：～ば/～たら/～と/～なら、～ている/～てある）。漢字にはふりがなをつけてください",
      "use_when": "どんな時にこのパターンを使うか、短く1文で（やさしい日本語、全ての漢字にふりがなをつけてください）",
      "example": "このパターンを使った短くて自然な例文を1つ（ぱっと見て比べられるように短く、全ての漢字にふりがなをつけてください）"
    }
  ],
  "bunpro_tip": "BunProでこの文法を覚えるコツを1〜2文で（やさしい日本語、ふりがなつき）"
}

SENTENCE RULES:
- Generate exactly 4 sentences
- NATURALNESS over textbook polish: write each sentence the way a native actually says it in that register — natural collocations and casual contractions/ellipsis (〜ちゃう、〜とく、〜んだ、dropped particles) in casual registers, not stiff scripted forms. Keep the register label honest about what the Japanese actually is.
- MUST cover: one clearly casual, one standard/polite, one formal or written
- Fourth sentence: a tricky or nuanced use that surprises learners
- ALL kanji (CJK characters) in Japanese output must have ruby furigana tags; never add ruby to English or Roman text
- This includes sentences[].notes — if a note contains Japanese, every kanji needs <ruby> tags`;

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
  if (opts.jj) result._jj = true;
  await repairResult(result); // patch any nondeterministically-dropped ruby in place
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
  if (opts.jj) result._jj = true;
  await repairResult(result); // patch any nondeterministically-dropped ruby in place
  yield { type: 'done', result };
}

module.exports = { lookup, lookupStream, toAnkiTSV, identifyWords };
