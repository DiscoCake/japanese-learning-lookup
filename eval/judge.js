/**
 * eval/judge.js — LLM-judge for lookup() output quality.
 *
 * The deterministic checks in checks.js guard STRUCTURE (ruby, contract, counts).
 * This judge guards what they can't: whether the Japanese is actually NATURAL,
 * whether register labels are honest, and whether a grammar "minimal pair" is
 * genuinely minimal. It is ADVISORY — it never gates `npm run eval:check`.
 *
 * Pure async function: judge(result) -> { scores, flags, notes }.
 * Same fetch/parse shape as src/lookup.js so it has no framework dependencies.
 */
require('dotenv').config();

const API_URL = 'https://api.anthropic.com/v1/messages';
/* Judge with the strongest model — judging quality matters more than speed, and
   this runs infrequently (manually, after a prompt change). Override via env. */
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'claude-opus-4-8';

/* Dimensions scored 1–5. minimal_pair only applies to grammar; the judge returns
   null for it on vocab. Keep this list in sync with the prompt below. */
const DIMENSIONS = ['naturalness', 'register_accuracy', 'minimal_pair', 'confusion_relevance', 'intuition'];

const JUDGE_SYSTEM = `You are a strict native-Japanese language assessor evaluating the OUTPUT of a study tool for an N4→N3 learner. The tool takes one word or grammar pattern and returns a JSON breakdown with example sentences, a "confused_with" contrast, and prose explanations.

Your job is to score how well the output bridges the gap between technically correct Japanese and naturally flowing Japanese. Be honest and critical — a textbook-correct but stiff sentence is a 2, not a 4. You are not checking JSON structure or furigana (other tools do that).

Score each dimension from 1 (poor) to 5 (excellent):

- naturalness: Do the example sentences (sentences[].jp) read like something a native speaker would actually say or write in that register? Penalize stiff, textbook-scripted phrasing; reward natural ellipsis, contractions, and collocations appropriate to the labeled register.
- register_accuracy: Does each sentence's actual Japanese match its "register" label (casual / standard / formal / written)? Penalize a sentence labeled "casual" that uses polite/formal forms, or vice versa.
- minimal_pair: GRAMMAR ONLY. Is confused_with.contrast a true minimal pair — two sentences that are nearly identical except for the pattern being contrasted, so the difference is isolated? Penalize contrasts where the two sentences differ in subject, topic, or situation. Return null for vocab output.
- confusion_relevance: Is confused_with actually the word/pattern this learner is MOST likely to confuse with the target — not just a loosely related one?
- intuition: Does the main explanation (core_meaning for vocab, real_meaning for grammar) build usage intuition — the feeling/when-to-reach-for-it — rather than restate a dictionary gloss?

OUTPUT: valid JSON only — no markdown fences, no extra text:
{
  "scores": { "naturalness": 0, "register_accuracy": 0, "minimal_pair": 0, "confusion_relevance": 0, "intuition": 0 },
  "flags": ["short phrases naming the single worst issue(s), if any"],
  "notes": "1-2 sentence overall justification"
}
For vocab output, set "minimal_pair" to null.`;

/* Judge a single lookup result. Returns { model, scores, flags, notes }.
   Throws on API/parse failure (caller decides how to record it). */
async function judge(result) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — check your .env file');
  }

  const target = result.mode === 'grammar' ? result.pattern : result.word;
  const userMsg = `Mode: ${result.mode}\nTarget: ${target}\n\nTool output to evaluate:\n${JSON.stringify(result, null, 2)}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 1200,
      output_config: { effort: 'medium' },
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  if (!raw) throw new Error('Empty response from judge API');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse judge response as JSON: ' + raw.slice(0, 200));
  }

  return {
    model: JUDGE_MODEL,
    scores: parsed.scores || {},
    flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    notes: parsed.notes || ''
  };
}

module.exports = { judge, DIMENSIONS, JUDGE_MODEL };
