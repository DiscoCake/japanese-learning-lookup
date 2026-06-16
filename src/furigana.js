/**
 * furigana.js — auto-repair missing ruby furigana in lookup() output.
 *
 * Fresh API generations nondeterministically drop a <ruby> tag on a bare kanji
 * (usually one common kanji in a sentences[].jp), which fails the deterministic
 * ruby gate in eval/checks.js and forces a full, expensive re-roll on eval:update.
 * repairResult() patches those gaps in place so regenerated output passes the
 * ruby check the first time.
 *
 * No framework dependencies (no Express/DOM/CLI) — calling the Anthropic API is
 * fine, lookup.js already does it. Imported by lookup.js as a post-process hook.
 *
 * Strategy (only runs on fields that still contain bare kanji — a no-op, zero
 * API calls, on already-correct output):
 *   1. Free deterministic harvest: re-wrap a bare multi-kanji run using the same
 *      ruby the model already produced elsewhere in the result (unambiguous runs
 *      only — avoids the single-kanji wrong-reading trap, e.g. 来 = き vs らい).
 *   2. Cheap targeted LLM repair for whatever stray kanji remain (single kanji,
 *      or runs not seen elsewhere) — context-correct readings.
 *   3. Strip-tags guard: accept a repaired field only if it merely INSERTED ruby
 *      and changed no underlying Japanese text. Otherwise keep the original.
 *
 * Reading CORRECTNESS is unverifiable here (as it is in the original generation);
 * the guard only proves text integrity. On any failure the result is returned
 * unchanged — a repair must never break a lookup.
 */
require('dotenv').config();

const API_URL = 'https://api.anthropic.com/v1/messages';
/* Default to the generation model — repairing ruby reliably needs the same
   instruction-following that produces correct ruby in the first place, and the
   repair call's output is tiny (~50–150 tokens) so the cost is negligible vs a
   full re-roll. Weaker models botch the format (wrap the kana reading instead of
   the kanji); the guard rejects that, but then the repair is wasted. Overridable. */
const REPAIR_MODEL = process.env.FURIGANA_REPAIR_MODEL
  || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
/* FURIGANA_REPAIR=off disables the whole post-process (debugging). Default on. */
const REPAIR_ENABLED = (process.env.FURIGANA_REPAIR || 'on').toLowerCase() !== 'off';

/* Kept byte-for-byte aligned with eval/checks.js — repair must target exactly
   what the gate flags. (src/ must not import eval/; that would invert the dep.) */
const KANJI = /[㐀-䶿一-鿿豈-﫿]/g;
const RUBY_BLOCK = /<ruby>[\s\S]*?<\/ruby>/g;

/* Kanji characters in `text` NOT already inside a <ruby> block. */
function strayKanji(text) {
  if (typeof text !== 'string' || !text) return [];
  const stripped = text.replace(RUBY_BLOCK, '');
  return stripped.match(KANJI) || [];
}

/* Plain text with all markup removed — same transform toAnkiTSV uses.
   NOTE: keeps <rt> reading content (e.g. がっこう), so it is NOT the right basis
   for the repair guard — use baseText for that. */
function stripTags(s) {
  return typeof s === 'string' ? s.replace(/<[^>]+>/g, '') : s;
}

/* Underlying Japanese with ruby markup removed but base kanji kept:
   <ruby>学校<rt>がっこう</rt></ruby> → 学校. Drops <rt>…</rt> (the reading)
   first, then any remaining tags. This is the invariant the repair must preserve
   — it may only insert ruby, never change the base text. */
function baseText(s) {
  return typeof s === 'string'
    ? s.replace(/<rt>[\s\S]*?<\/rt>/g, '').replace(/<[^>]+>/g, '')
    : s;
}

/* ── FIELD SELECTION ──
   Mirrors prosePairs in eval/checks.js: the fields the ruby gate enforces.
   JJ prose is exempt (the gate only enforces sentences[i].jp for JJ). Returns
   [{ path, text }] with paths usable by getByPath/setByPath. */
function enforcedFields(result) {
  const pairs = [];
  const add = (path, text) => { if (typeof text === 'string' && text) pairs.push({ path, text }); };

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
  }

  (result.sentences || []).forEach((s, i) => {
    add(`sentences[${i}].jp`, s && s.jp);
    // notes carry ruby for non-JJ; the gate checks them (includeNotes:true).
    if (!result._jj) add(`sentences[${i}].notes`, s && s.notes);
  });

  return pairs;
}

/* ── PATH HELPERS (sentences[2].jp, confused_with.contrast, formation.rule) ── */
function pathParts(path) {
  return path.split('.').map(seg => {
    const m = seg.match(/^([^\[]+)\[(\d+)\]$/);
    return m ? [m[1], Number(m[2])] : [seg];
  }).flat();
}
function getByPath(obj, path) {
  return pathParts(path).reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setByPath(obj, path, value) {
  const parts = pathParts(path);
  const last = parts.pop();
  const parent = parts.reduce((o, k) => (o == null ? o : o[k]), obj);
  if (parent != null) parent[last] = value;
}

/* ── STEP 1: DETERMINISTIC HARVEST ──
   Map every <ruby>base<rt>reading</rt></ruby> in the result to its full markup.
   Keep only multi-kanji bases (length ≥ 2) that resolve to a single reading
   across the whole result — these are safe to re-apply to a bare occurrence. */
const ONE_RUBY = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>/g;

function harvestRubyMap(result) {
  const seen = new Map();      // base → Set<full markup>
  const walk = (v) => {
    if (typeof v === 'string') {
      let m;
      ONE_RUBY.lastIndex = 0;
      while ((m = ONE_RUBY.exec(v))) {
        const base = m[1];
        if (base.length < 2) continue;                 // skip single kanji
        if ((base.match(KANJI) || []).length !== base.length) continue; // kanji-only base
        if (!seen.has(base)) seen.set(base, new Set());
        seen.get(base).add(m[0]);
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(result);

  const map = new Map();
  for (const [base, fulls] of seen) {
    if (fulls.size === 1) map.set(base, [...fulls][0]); // unambiguous only
  }
  return map;
}

/* Re-wrap bare occurrences of each harvested run. Operates outside existing
   <ruby> blocks so it never touches correct markup. Longest base first so a
   longer run wins over a substring. */
function patchFromHarvest(text, map) {
  if (!map.size) return text;
  const bases = [...map.keys()].sort((a, b) => b.length - a.length);
  const blocks = text.split(RUBY_BLOCK);
  const tags = text.match(RUBY_BLOCK) || [];
  const patched = blocks.map(seg => {
    let out = seg;
    for (const base of bases) {
      if (out.includes(base)) out = out.split(base).join(map.get(base));
    }
    return out;
  });
  // re-interleave: blocks[0] tag[0] blocks[1] tag[1] ...
  let result = '';
  for (let i = 0; i < patched.length; i++) {
    result += patched[i] + (tags[i] || '');
  }
  return result;
}

/* ── STEP 2: LLM REPAIR ──
   One small call. Sends the still-broken fields and asks for the same text with
   ruby added to every bare kanji, nothing else changed. Returns { path: text }. */
async function repairRubyLLM(fields) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const system = `You add missing furigana ruby tags to Japanese text. You are given a JSON object whose values are Japanese strings, each missing <ruby> tags on one or more kanji.

For each value, return the SAME text with <ruby>漢字<rt>かんじ</rt></ruby> tags added to EVERY bare kanji (CJK ideograph). The KANJI goes inside <ruby>…</ruby>; its hiragana READING goes inside <rt>…</rt>. Use the correct reading for each kanji IN CONTEXT.

Example — input value:  "これ見て！日本に行く"
correct output value:    "これ<ruby>見<rt>み</rt></ruby>て！<ruby>日本<rt>にほん</rt></ruby>に<ruby>行<rt>い</rt></ruby>く"
WRONG (do not do this):  "これ見<ruby>み<rt>み</rt></ruby>て"  ← never wrap the kana; the kanji must be inside <ruby>, never left bare.

ABSOLUTE RULES:
- Change NOTHING except inserting <ruby> markup. Do not add, remove, reorder, or rephrase any character of the underlying text — kana, punctuation, English, and existing <ruby> blocks must remain byte-for-byte identical.
- Never add ruby to kana, Roman letters, or English words — only to kanji.
- Keep the exact same JSON keys.

OUTPUT: valid JSON only — no markdown fences, no extra text. An object mapping each input key to its repaired string.`;

  const payload = {};
  for (const { path, text } of fields) payload[path] = text;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      // No output_config.effort: the default repair model (Haiku) rejects it, and
      // a tiny ruby-insertion task does not need extended effort regardless.
      model: REPAIR_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`repair API error ${res.status}: ${err.error?.message || 'unknown'}`);
  }
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

/* ── GUARDS ──
   textPreserved: the change only touched markup — underlying plain text is
   byte-for-byte identical. Used to accept a harvest patch, which may legitimately
   leave some kanji still bare (the LLM step finishes those).
   repairIsSafe: textPreserved AND no stray kanji remain — the stronger guard for
   accepting the final LLM repair. Reading correctness stays unverifiable; these
   only prove text integrity. */
function textPreserved(before, after) {
  return typeof after === 'string' && baseText(after) === baseText(before);
}
function repairIsSafe(before, after) {
  return textPreserved(before, after) && strayKanji(after).length === 0;
}

/* ── ORCHESTRATOR ──
   Returns the (possibly repaired) result. Fail-open: any error → unchanged. */
async function repairResult(result) {
  if (!REPAIR_ENABLED || !result || typeof result !== 'object') return result;

  try {
    // Anything broken to begin with?
    const broken = () => enforcedFields(result).filter(f => strayKanji(f.text).length);
    if (!broken().length) return result;

    // Step 1 — free deterministic harvest.
    const map = harvestRubyMap(result);
    if (map.size) {
      for (const { path, text } of broken()) {
        const patched = patchFromHarvest(text, map);
        // harvest may only partially fix a field (single bare kanji left for the
        // LLM step); accept any text-preserving improvement.
        if (patched !== text && textPreserved(text, patched)) setByPath(result, path, patched);
      }
    }

    // Step 2 — LLM repair for whatever stray kanji remain.
    const remaining = broken();
    if (!remaining.length) return result;

    const repaired = await repairRubyLLM(remaining);
    for (const { path, text } of remaining) {
      const after = repaired[path];
      if (repairIsSafe(text, after)) setByPath(result, path, after);
    }
  } catch (e) {
    // Fail-open: leave any stray kanji for the gate to catch, never throw.
    if (process.env.FURIGANA_REPAIR_DEBUG) console.error('furigana repair failed:', e.message);
  }
  return result;
}

module.exports = {
  repairResult,
  // exported for testing the pieces in isolation
  strayKanji,
  stripTags,
  baseText,
  enforcedFields,
  harvestRubyMap,
  patchFromHarvest,
  textPreserved,
  repairIsSafe,
  getByPath,
  setByPath,
};
