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
const golden = require('./golden');

const SNAP_DIR = path.join(__dirname, 'snapshots');
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
function snapPath(c) {
  return path.join(SNAP_DIR, `${c.mode}_${slug(c.input)}${c.jj ? '_jj' : ''}.json`);
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
      return await lookup(c.input, { jj: c.jj || false });
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
  const cases = missingOnly ? golden.filter(c => !fs.existsSync(snapPath(c))) : golden;
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
  const rows = golden.map((c) => {
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

async function main() {
  const cmd = process.argv[2] || 'check';
  const missingOnly = process.argv.includes('--missing');
  let failed;
  if (cmd === 'check') {
    console.log('Checking snapshots (no API calls)…');
    failed = runCheck();
  } else if (cmd === 'update') {
    console.log(missingOnly
      ? 'Refreshing only missing snapshots from the API…'
      : `Refreshing ${golden.length} snapshots from the API…`);
    await runLive({ write: true, missingOnly });
    console.log('Snapshots updated. Review the diff before committing.');
    failed = 0; // update never fails the process
  } else if (cmd === 'run') {
    console.log(`Running ${golden.length} live lookups and checking fresh output…`);
    failed = await runLive({ write: false, missingOnly });
  } else {
    console.error(`Unknown command "${cmd}". Use: check | update | run`);
    process.exit(2);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
