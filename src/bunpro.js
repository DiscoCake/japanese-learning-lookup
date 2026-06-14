/**
 * bunpro.js — BunPro frontend API client
 * No framework dependencies. Import from server.js.
 *
 * Auth: BUNPRO_TOKEN — the frontend JWT from browser localStorage.
 * How to get it:
 *   1. Open bunpro.jp while logged in
 *   2. DevTools → Application → Local Storage → https://bunpro.jp
 *   3. Copy the value of `frontend_api_token`
 *   4. Add BUNPRO_TOKEN=<value> to .env and restart the server
 *
 * The old account API key (bunpro.jp → Account → API) is for a defunct v1 API — it does not work here.
 */

const BUNPRO_BASE = 'https://api.bunpro.jp/api/frontend';

function bunproHeaders() {
  const token = process.env.BUNPRO_TOKEN;
  if (!token) throw new Error('BUNPRO_TOKEN not set');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

async function bunproGet(path) {
  const res = await fetch(`${BUNPRO_BASE}${path}`, { headers: bunproHeaders() });
  if (res.status === 401) throw new Error('BunPro auth failed — is BUNPRO_TOKEN current?');
  if (!res.ok) throw new Error(`BunPro API ${res.status} for ${path}`);
  return res.json();
}

// Strip ～/〜, lowercase, trim — for fuzzy pattern matching
function normalisePattern(p) {
  return (p || '').replace(/[～〜]/g, '').trim().toLowerCase();
}

// Fetch all review pages and return flat array
async function fetchAllReviews() {
  const perPage = 500; // API accepts up to 500 per page; fall back to 100 if it rejects
  let page = 1;
  const all = [];
  while (true) {
    const data = await bunproGet(`/reviews?page=${page}&per_page=${perPage}`);
    const items = data.reviews?.data || data.data || data.reviews || [];
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (items.length < perPage) break; // last page
    page++;
    if (page > 20) break; // safety cap
  }
  return all;
}

function extractPattern(item) {
  // Handle both JSON:API style {attributes: {...}} and flat objects
  const attrs = item.attributes || item;
  return attrs.grammar_point?.title
    || attrs.grammar_point_title
    || attrs.title
    || attrs.japanese
    || '';
}

function extractSrsLevel(item) {
  const attrs = item.attributes || item;
  return attrs.srs_level
    || attrs.srs_stage_name
    || (attrs.srs_stage != null ? srsStageToName(attrs.srs_stage) : null)
    || 'unknown';
}

function srsStageToName(stage) {
  const map = { 0:'new', 1:'beginner', 2:'beginner', 3:'adept', 4:'adept',
                5:'seasoned', 6:'seasoned', 7:'expert', 8:'expert', 9:'master', 10:'ghost' };
  return map[stage] ?? String(stage);
}

function mapReviewItem(item) {
  const attrs = item.attributes || item;
  const gp = attrs.grammar_point || {};
  return {
    pattern:       extractPattern(item),
    reading:       gp.yomikata || attrs.reading || '',
    srsLevel:      extractSrsLevel(item),
    nextReview:    attrs.next_review || attrs.next_review_date || null,
    correctStreak: attrs.streak ?? attrs.correct_streak ?? 0,
    lapses:        attrs.miss_count ?? attrs.lapses ?? attrs.incorrect_streak ?? 0,
    jlpt:          gp.level || attrs.jlpt_level || attrs.level || '',
    bunproPath:    gp.path || attrs.path || null,
  };
}

/* ── GET SRS STATUS FOR A SPECIFIC GRAMMAR PATTERN ── */
async function getGrammarStatus(pattern) {
  const reviews = await fetchAllReviews();
  const needle = normalisePattern(pattern);

  const match = reviews.find(item => {
    const candidates = [
      extractPattern(item),
      (item.attributes || item).japanese,
    ].filter(Boolean);
    return candidates.some(c => normalisePattern(c) === needle);
  });

  if (!match) return null;
  return mapReviewItem(match);
}

/* ── GET TROUBLED / GHOST GRAMMAR LIST ── */
async function getTroubledGrammar({ limit = 50 } = {}) {
  let items = [];

  // Try the ghost reviews endpoint first
  try {
    const data = await bunproGet('/user_stats/srs_ghost_level_details?reviewable_type=Grammar');
    const raw = data.reviews?.data || data.data || data.reviews || data || [];
    items = Array.isArray(raw) ? raw : [];
    console.log(`BunPro: fetched ${items.length} ghost reviews`);
  } catch (ghostErr) {
    console.log(`BunPro: ghost endpoint failed (${ghostErr.message}), falling back to /reviews filter`);
    try {
      const all = await fetchAllReviews();
      items = all.filter(item => {
        const lapses = (item.attributes || item).miss_count
          ?? (item.attributes || item).lapses
          ?? 0;
        return lapses >= 2;
      });
      console.log(`BunPro: found ${items.length} troubled grammar from /reviews`);
    } catch (allErr) {
      throw new Error(`BunPro unreachable: ${allErr.message}`);
    }
  }

  return items
    .map(mapReviewItem)
    .filter(i => i.pattern)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit);
}

module.exports = { getGrammarStatus, getTroubledGrammar };
