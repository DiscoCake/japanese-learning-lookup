const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const MAX_HISTORY = 50;

function read() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function write(entries) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries.slice(0, MAX_HISTORY), null, 2));
  } catch (e) {
    console.error('History write error:', e.message);
  }
}

function getHistory() {
  return read();
}

function addEntry(r) {
  let entries = read();
  entries = entries.filter(h => !(h.input === r.input && !!h.jj === !!r.jj));
  entries.unshift(r);
  write(entries);
  return entries;
}

function deleteEntry(input, jj) {
  let entries = read();
  entries = entries.filter(h => !(h.input === input && !!h.jj === !!jj));
  write(entries);
  return entries;
}

function clearEntries() {
  write([]);
  return [];
}

// Merge incoming entries with existing, dedup by input+jj, sort newest first, cap at 50
function mergeEntries(incoming) {
  const existing = read();
  const merged = [...incoming, ...existing];
  const seen = new Set();
  const deduped = merged.filter(h => {
    const key = `${h.input}|${!!h.jj}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  write(deduped);
  return deduped;
}

module.exports = { getHistory, addEntry, deleteEntry, clearEntries, mergeEntries };
