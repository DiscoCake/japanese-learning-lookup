/**
 * eval/run.js — prompt-output regression harness for lookup().
 *
 *   node eval/run.js check    (npm run eval:check)
 *     Run deterministic checks against saved eval/snapshots/*.json.
 *     No API calls — free, fast, the everyday/CI gate. Exits nonzero on failure.
 *
 *   node eval/run.js update   (npm run eval:update)
 *     Re-run every golden case through the live API and overwrite snapshots.
 *     Reports check results for visibility but always exits 0. Run this
 *     deliberately after a prompt change, then review the snapshot diff.
 *
 *   node eval/run.js run      (npm run eval)
 *     Run every golden case through the live API and check the FRESH output
 *     WITHOUT writing snapshots. Exits nonzero on failure.
 */
const fs = require('fs');
const path = require('path');
const { lookup } = require('../src/lookup');
const { runChecks } = require('./checks');
const { judge, DIMENSIONS } = require('./judge');
const golden = require('./golden');

const SNAP_DIR = path.join(__dirname, 'snapshots');
const SCORES_FILE = path.join(__dirname, 'judge-scores.json');
/* Advisory floor for `eval:judge --gate`. Off unless --gate is passed; the
   deterministic `check` command stays the only hard CI gate. */
const SCORE_FLOOR = 3;

/* `--only <substr>` narrows every command to matching cases — the cost lever for
   prompt iteration: regenerate/judge a handful instead of the full set. Matches
   on input substring, exact mode ("vocab"/"grammar"), or "jj". */
let ONLY = null;
function selectGolden() {
  if (!ONLY) return golden;
  return golden.filter(c =>
    c.input.includes(ONLY) || c.mode === ONLY || (ONLY === 'jj' && c.jj));
}
/* Live calls run serially with pacing + 429 backoff. The org's output-token
   rate limit (8k/min on the base tier) is easily exceeded by parallel 3000-token
   lookups, so we trade speed for reliability here. */
const SPACING_MS = 9000;   // minimum gap between live call starts
const MAX_RETRIES = 4;     // retries on HTTP 429
const BACKOFF_MS = 65000;  // wait after a 429 (rate window is per-minute)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function slug(input) {
  return input.replace(/[～〜\s/\\:*?"<>|]/g, '_').replace(/^_+|_+$/g, '') || 'x';
}
/* Short stable tag so context-biased cases get their own snapshot instead of
   colliding with the bare-input snapshot for the same word/pattern. */
function ctxTag(c) {
  if (!c.context) return '';
  let h = 0;
  for (let i = 0; i < c.context.length; i++) h = (h * 31 + c.context.charCodeAt(i)) >>> 0;
  return '_ctx' + h.toString(36).slice(0, 6);
}
function snapPath(c) {
  return path.join(SNAP_DIR, `${c.mode}_${slug(c.input)}${c.jj ? '_jj' : ''}${ctxTag(c)}.json`);
}

/* Run check fns against a result; fold in an expected-mode check. Returns
   { ok, lines } where lines are human-readable failure messages. */
function evaluate(c, result) {
  const lines = [];
  if (result.mode !== c.mode) {
    lines.push(`mode: detected "${result.mode}", expected "${c.mode}"`);
  }
  for (const { name, pass, messages } of runChecks(result)) {
    if (!pass) messages.forEach(m => lines.push(`${name}: ${m}`));
  }
  return { ok: lines.length === 0, lines };
}

/* lookup() with 429 backoff. Other errors propagate immediately. */
async function lookupWithRetry(c) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await lookup(c.input, { jj: c.jj || false, context: c.context });
    } catch (e) {
      if (/\b429\b/.test(e.message) && attempt < MAX_RETRIES) {
        console.log(`      rate limited — waiting ${BACKOFF_MS / 1000}s (retry ${attempt + 1}/${MAX_RETRIES})…`);
        await sleep(BACKOFF_MS);
        continue;
      }
      throw e;
    }
  }
}

/* judge() with the same 429 backoff as lookupWithRetry. */
async function judgeWithRetry(result) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await judge(result);
    } catch (e) {
      if (/\b429\b/.test(e.message) && attempt < MAX_RETRIES) {
        console.log(`      rate limited — waiting ${BACKOFF_MS / 1000}s (retry ${attempt + 1}/${MAX_RETRIES})…`);
        await sleep(BACKOFF_MS);
        continue;
      }
      throw e;
    }
  }
}

function report(rows) {
  let failed = 0;
  console.log('');
  for (const r of rows) {
    const label = `${r.case.mode.padEnd(7)} ${r.case.input}${r.case.jj ? ' (JJ)' : ''}`;
    if (r.error) {
      failed++;
      console.log(`  ✗ ${label}\n      ERROR: ${r.error}`);
    } else if (r.ok) {
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ ${label}`);
      r.lines.forEach(l => console.log(`      ${l}`));
    }
  }
  const passed = rows.length - failed;
  console.log(`\n  ${passed}/${rows.length} passed${failed ? `, ${failed} failed` : ''}\n`);
  return failed;
}

async function runLive({ write, missingOnly }) {
  if (write) fs.mkdirSync(SNAP_DIR, { recursive: true });
  const base = selectGolden();
  const cases = missingOnly ? base.filter(c => !fs.existsSync(snapPath(c))) : base;
  if (!cases.length) { console.log('  (nothing to do — all snapshots present)\n'); return 0; }

  const rows = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (i > 0) await sleep(SPACING_MS);
    try {
      const result = await lookupWithRetry(c);
      if (write) fs.writeFileSync(snapPath(c), JSON.stringify(result, null, 2) + '\n');
      rows.push({ case: c, ...evaluate(c, result) });
    } catch (e) {
      rows.push({ case: c, ok: false, lines: [], error: e.message });
    }
  }
  return report(rows);
}

function runCheck() {
  const rows = selectGolden().map((c) => {
    const p = snapPath(c);
    if (!fs.existsSync(p)) {
      return { case: c, ok: false, lines: ['no snapshot — run `npm run eval:update`'] };
    }
    try {
      const result = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { case: c, ...evaluate(c, result) };
    } catch (e) {
      return { case: c, ok: false, error: `bad snapshot JSON: ${e.message}` };
    }
  });
  return report(rows);
}

/* Round to 2 decimals, ignoring null/undefined scores. */
function avg(nums) {
  const xs = nums.filter(n => typeof n === 'number');
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
}

/* ADVISORY judge pass over existing snapshots. Calls the API (one judge call per
   snapshot) but never regenerates snapshots, and by default never fails the
   process — `check` stays the hard gate. Pass --gate to fail below SCORE_FLOOR. */
async function runJudge({ gate }) {
  const base = selectGolden();
  const present = base.filter(c => fs.existsSync(snapPath(c)));
  const missing = base.length - present.length;
  if (!present.length) {
    console.log('  (no snapshots to judge — run `npm run eval:update` first)\n');
    return 0;
  }
  if (missing) console.log(`  (${missing} snapshot(s) missing — judging the ${present.length} present)`);

  const rows = [];
  for (let i = 0; i < present.length; i++) {
    const c = present[i];
    if (i > 0) await sleep(SPACING_MS);
    const label = `${c.mode.padEnd(7)} ${c.input}${c.jj ? ' (JJ)' : ''}`;
    try {
      const result = JSON.parse(fs.readFileSync(snapPath(c), 'utf8'));
      const verdict = await judgeWithRetry(result);
      rows.push({ case: c, ...verdict });
      const s = verdict.scores;
      const cells = DIMENSIONS.map(d => `${d.slice(0, 4)}:${s[d] ?? '-'}`).join('  ');
      console.log(`  • ${label}\n      ${cells}${verdict.flags.length ? `\n      ⚑ ${verdict.flags.join('; ')}` : ''}`);
    } catch (e) {
      rows.push({ case: c, error: e.message });
      console.log(`  ✗ ${label}\n      ERROR: ${e.message}`);
    }
  }

  const scored = rows.filter(r => r.scores);
  const averages = {};
  console.log('\n  Per-dimension averages:');
  for (const d of DIMENSIONS) {
    averages[d] = avg(scored.map(r => r.scores[d]));
    console.log(`    ${d.padEnd(20)} ${averages[d] ?? 'n/a'}`);
  }

  fs.writeFileSync(SCORES_FILE, JSON.stringify({
    judgedAt: new Date().toISOString(),
    model: scored[0]?.model || null,
    averages,
    cases: rows.map(r => ({
      input: r.case.input, mode: r.case.mode, jj: !!r.case.jj,
      scores: r.scores || null, flags: r.flags || [], notes: r.notes || '', error: r.error || null,
    })),
  }, null, 2) + '\n');
  console.log(`\n  Wrote ${path.relative(process.cwd(), SCORES_FILE)} (advisory — not a gate)\n`);

  if (gate) {
    const below = scored.filter(r => DIMENSIONS.some(d => typeof r.scores[d] === 'number' && r.scores[d] < SCORE_FLOOR));
    if (below.length) {
      console.log(`  --gate: ${below.length} case(s) scored below ${SCORE_FLOOR}\n`);
      return below.length;
    }
  }
  return 0;
}

async function main() {
  const cmd = process.argv[2] || 'check';
  const missingOnly = process.argv.includes('--missing');
  const gate = process.argv.includes('--gate');
  const onlyIdx = process.argv.indexOf('--only');
  if (onlyIdx >= 0) ONLY = process.argv[onlyIdx + 1] || null;
  if (ONLY) console.log(`(--only "${ONLY}" → ${selectGolden().length} case(s))`);
  let failed;
  if (cmd === 'check') {
    console.log('Checking snapshots (no API calls)…');
    failed = runCheck();
  } else if (cmd === 'update') {
    console.log(missingOnly
      ? 'Refreshing only missing snapshots from the API…'
      : `Refreshing ${selectGolden().length} snapshots from the API…`);
    await runLive({ write: true, missingOnly });
    console.log('Snapshots updated. Review the diff before committing.');
    failed = 0; // update never fails the process
  } else if (cmd === 'run') {
    console.log(`Running ${selectGolden().length} live lookups and checking fresh output…`);
    failed = await runLive({ write: false, missingOnly });
  } else if (cmd === 'judge') {
    console.log(`Judging snapshots with the LLM-judge${gate ? ' (--gate on)' : ' (advisory)'}…`);
    failed = await runJudge({ gate });
  } else {
    console.error(`Unknown command "${cmd}". Use: check | update | run | judge`);
    process.exit(2);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
