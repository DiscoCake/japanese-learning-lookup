#!/usr/bin/env node
/**
 * cli.js — command-line interface for Japanese Study Companion
 *
 * Usage:
 *   node src/cli.js 見る
 *   node src/cli.js ～てしまう
 *   node src/cli.js --tsv 見る        (output Anki TSV)
 *   node src/cli.js --raw 見る        (output raw JSON)
 */
require('dotenv').config();
const { lookup, toAnkiTSV } = require('./lookup');

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: node src/cli.js [--tsv|--raw] <word or grammar pattern>');
  console.log('Examples:');
  console.log('  node src/cli.js 見る');
  console.log('  node src/cli.js ～てしまう');
  console.log('  node src/cli.js --tsv ところ');
  process.exit(0);
}

const flags = args.filter(a => a.startsWith('--'));
const tsvMode = flags.includes('--tsv');
const rawMode = flags.includes('--raw');
const input = args.filter(a => !a.startsWith('--')).join(' ');

if (!input) {
  console.error('No input provided.');
  process.exit(1);
}

/* strip HTML tags for terminal output */
function strip(s) { return (s || '').replace(/<[^>]+>/g, ''); }

function printVocab(r) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📖  ${r.word}【${r.reading}】  (vocab)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n💡 ${r.core_meaning}\n`);

  console.log('─── Example sentences ───');
  r.sentences.forEach((s, i) => {
    console.log(`\n${i + 1}. [${s.register}]`);
    console.log(`   ${strip(s.jp)}`);
    console.log(`   ${s.translation}`);
    if (s.notes) console.log(`   ↳ ${s.notes}`);
  });

  console.log('\n─── When NOT to use this ───');
  console.log(r.dont_use);

  console.log('\n─── Often confused with ───');
  console.log(`${r.confused_with.word}【${r.confused_with.reading}】`);
  console.log(r.confused_with.contrast);

  console.log('\n─── Frequency / register ───');
  console.log(r.frequency);

  console.log('\n─── Anki hint ───');
  console.log(r.anki_hint);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function printGrammar(r) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📚  ${r.pattern}  (grammar)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n💡 ${r.real_meaning}\n`);

  console.log('─── Formation ───');
  console.log(r.formation.rule);
  console.log(`\n⚠️  Common mistake: ${r.formation.common_mistake}`);

  console.log('\n─── Example sentences ───');
  r.sentences.forEach((s, i) => {
    console.log(`\n${i + 1}. [${s.register}]`);
    console.log(`   ${strip(s.jp)}`);
    console.log(`   ${s.translation}`);
    if (s.notes) console.log(`   ↳ ${s.notes}`);
  });

  console.log('\n─── Often confused with ───');
  console.log(r.confused_with.pattern);
  console.log(r.confused_with.contrast);

  console.log('\n─── BunPro tip ───');
  console.log(r.bunpro_tip);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

(async () => {
  try {
    console.log(`Looking up: ${input} …`);
    const result = await lookup(input);

    if (rawMode) { console.log(JSON.stringify(result, null, 2)); return; }
    if (tsvMode) { console.log(toAnkiTSV(result)); return; }

    if (result.mode === 'vocab') printVocab(result);
    else printGrammar(result);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
