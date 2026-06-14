/**
 * Kanjium pitch accent dictionary lookup.
 * Data file: data/kanjium_accents.txt (~124k entries, loaded lazily at first call).
 * Falls back silently (returns null) if the file is missing.
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'kanjium_accents.txt');

// Small kana that form a compound mora with the preceding character.
const SMALLS = new Set('ゃゅょぁぃぅぇぉャュョァィゥェォ');

let exactMap = null;   // 'word\treading' → number[]
let wordMap = null;    // word → number[] (first reading wins)
let readingMap = null; // reading → number[] (first word wins)

function load() {
  if (exactMap) return;
  exactMap = new Map();
  wordMap = new Map();
  readingMap = new Map();

  let data;
  try {
    data = fs.readFileSync(DATA_PATH, 'utf-8');
  } catch {
    return;
  }

  for (const line of data.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [word, reading, accentsRaw] = parts;
    if (!word || !accentsRaw) continue;

    const numbers = accentsRaw.trim().split(',')
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !isNaN(n));
    if (!numbers.length) continue;

    const r = reading || '';
    exactMap.set(`${word}\t${r}`, numbers);
    if (!wordMap.has(word)) wordMap.set(word, numbers);
    if (r && !readingMap.has(r)) readingMap.set(r, numbers);
  }
}

// Splits a hiragana/katakana reading into morae, grouping small-kana compounds.
function toMorae(reading) {
  const out = [];
  for (let i = 0; i < reading.length; i++) {
    if (i + 1 < reading.length && SMALLS.has(reading[i + 1])) {
      out.push(reading[i] + reading[i + 1]);
      i++;
    } else {
      out.push(reading[i]);
    }
  }
  return out;
}

function pitchLabel(n, reading) {
  if (n === 0) return 'heiban';
  if (n === 1) return 'atamadaka';
  const mc = toMorae(reading).length;
  return n >= mc ? 'odaka' : 'nakadaka';
}

function pitchPattern(n, reading) {
  const ms = toMorae(reading);
  return ms.map((_, i) => {
    if (n === 0) return i === 0 ? 'L' : 'H';
    if (n === 1) return i === 0 ? 'H' : 'L';
    if (i === 0) return 'L';
    return i < n ? 'H' : 'L';
  }).join('');
}

/**
 * Look up pitch accent for a word+reading pair.
 * Returns { number, label, pattern } or null if not found.
 *
 * Lookup order:
 *   1. word + reading (exact)
 *   2. word + empty reading (kana-only entries stored with blank reading column)
 *   3. word alone (covers kanji forms with a single dominant reading)
 *   4. reading alone (last resort, covers kana-form lookups)
 */
function lookupPitch(word, reading) {
  load();
  if (!exactMap || !word) return null;

  const w = word.trim();
  const r = (reading || '').trim();

  const numbers =
    exactMap.get(`${w}\t${r}`) ||
    exactMap.get(`${w}\t`) ||
    wordMap.get(w) ||
    (r ? readingMap.get(r) : null);

  if (!numbers || !numbers.length) return null;

  const n = numbers[0]; // first listed is most common
  const calc = r || w;  // use reading for mora math; fall back to word if no reading

  return {
    number: n,
    label: pitchLabel(n, calc),
    pattern: pitchPattern(n, calc),
  };
}

module.exports = { lookupPitch };
