#!/usr/bin/env node
/**
 * Golden-path smoke test for Japanese Study Companion.
 * Requires the app running at http://localhost:3001.
 * Exit 0 = all pass, exit 1 = one or more failures.
 *
 * Usage:
 *   npm run test:smoke
 *   node test/smoke.js
 *
 * To install Playwright if not present:
 *   npm install --save-dev playwright && npx playwright install chromium
 */

let chromium;
const tryPaths = [
  'playwright',
  '/Users/jasonalmerini/.npm/_npx/e41f203b7505f1fb/node_modules/playwright',
];
for (const p of tryPaths) {
  try { ({ chromium } = require(p)); break; } catch {}
}
if (!chromium) {
  console.error('playwright not found. Install with: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const failures = [];

  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE ERR: ' + e.message));

  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');

  // 1. Zero console errors on load
  if (errors.length) {
    failures.push(`Console errors on load: ${errors.join('; ')}`);
  } else {
    console.log('✅ Page load — zero console errors');
  }

  const si = page.locator('#search-input');

  // 2. Mode pill auto-detects grammar for pure hiragana (3+ chars)
  await si.fill('ところ');
  await page.waitForTimeout(100);
  const pillText = (await page.locator('#mode-indicator').textContent() || '').trim();
  if (pillText !== '文法') {
    failures.push(`Mode pill: expected 文法, got "${pillText}"`);
  } else {
    console.log('✅ Mode pill — ところ auto-detects 文法');
  }

  // 3. Mode pill auto-detects vocab for kanji input
  await si.fill('見る');
  await page.waitForTimeout(100);
  const vocabPill = (await page.locator('#mode-indicator').textContent() || '').trim();
  if (vocabPill !== '単語') {
    failures.push(`Mode pill: expected 単語 for 見る, got "${vocabPill}"`);
  } else {
    console.log('✅ Mode pill — 見る auto-detects 単語');
  }

  // 4. 見る lookup returns at least 3 cards
  errors.length = 0;
  await page.locator('#search-btn').click();
  // Wait for streaming to start (loading appears) then finish (loading hidden)
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'flex', { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('loading')?.style.display !== 'flex', { timeout: 30000 });
  await page.waitForTimeout(100);
  const cards = await page.locator('#result .card').count();
  if (cards < 3) {
    failures.push(`Lookup result: expected ≥3 cards, got ${cards}`);
  } else {
    console.log(`✅ Lookup — 見る returned ${cards} cards`);
  }

  // 5. Speak buttons present after lookup
  const speakBtns = await page.locator('#result .speak-btn').count();
  if (speakBtns < 1) {
    failures.push('Speak buttons: none found after lookup');
  } else {
    console.log(`✅ TTS — ${speakBtns} speak button(s) present`);
  }

  // 6. Furigana toggle hides/shows the rt element (CSS: .hide-furigana rt { display: none })
  const rt = page.locator('#result ruby rt').first();
  const beforeToggle = await rt.evaluate(el => getComputedStyle(el).display);
  await page.locator('#furigana-btn').click();
  await page.waitForTimeout(100);
  const afterToggle = await rt.evaluate(el => getComputedStyle(el).display);
  if (afterToggle !== 'none') {
    failures.push(`Furigana toggle: rt display should be none after toggle, got "${afterToggle}"`);
  } else {
    console.log('✅ Furigana toggle — hides/shows correctly');
  }
  // restore
  await page.locator('#furigana-btn').click();
  await page.waitForTimeout(100);

  // 7. History badge updated after lookup
  const badge = await page.locator('#history-btn .badge').textContent().catch(() => '0');
  if (parseInt(badge || '0') < 1) {
    failures.push(`History badge: expected ≥1 after lookup, got "${badge}"`);
  } else {
    console.log(`✅ History — badge shows ${badge}`);
  }

  // 8. Mode pill override: click flips mode, shows ✎ + dashed border
  await si.fill('見る');
  await page.waitForTimeout(100);
  await page.locator('#mode-indicator').click();
  const overridePill = (await page.locator('#mode-indicator').textContent() || '').trim();
  const hasManual = await page.locator('#mode-indicator').evaluate(el => el.classList.contains('manual'));
  if (!overridePill.includes('✎') || !hasManual) {
    failures.push(`Mode override: expected ✎ + manual class, got "${overridePill}" hasManual=${hasManual}`);
  } else {
    console.log(`✅ Mode override — click shows "${overridePill}" with dashed border`);
  }

  // 9. Typing resets override
  await si.press('a');
  await page.waitForTimeout(100);
  const afterType = await page.locator('#mode-indicator').evaluate(el => el.classList.contains('manual'));
  if (afterType) {
    failures.push('Mode override: still has manual class after typing');
  } else {
    console.log('✅ Mode override reset — typing clears the override');
  }

  // 10. Post-lookup console errors
  if (errors.length) {
    failures.push(`Console errors after lookup: ${errors.join('; ')}`);
  } else {
    console.log('✅ Post-lookup — zero console errors');
  }

  await browser.close();

  console.log('');
  if (failures.length) {
    console.log(`❌ ${failures.length} check(s) failed:`);
    failures.forEach(f => console.log(`   - ${f}`));
    process.exit(1);
  }
  console.log(`✅ All ${10} smoke checks passed`);
})().catch(e => {
  console.error('Smoke test crashed:', e.message);
  process.exit(1);
});
