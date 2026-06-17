/**
 * server.js — Express wrapper around lookup.js
 * Keeps ANTHROPIC_API_KEY server-side.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { lookup, lookupStream, toAnkiTSV, identifyWords } = require('./lookup');
const { getStrugglingCards, findNoteForWord, updateCardSentence, addNoteForWord, addNoteForGrammar, getDeckNames, enrichAndUpdateCard } = require('./anki');
const { getGrammarStatus, getTroubledGrammar } = require('./bunpro');
const { getHistory, addEntry, deleteEntry, clearEntries, mergeEntries } = require('./history');

const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY — copy .env.example to .env');
  process.exit(1);
}

/* In-memory sliding-window rate limiter for Claude-calling routes.
   Protects against a misbehaving/retrying tab burning API credits.
   Only applied to the four cost-bearing routes — not Anki/BunPro/static. */
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN) || 30;
const _rateBuckets = new Map(); // ip → timestamp[]
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = (_rateBuckets.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) {
    return res.status(429).json({ error: `Rate limit: max ${RATE_LIMIT} lookups/min` });
  }
  timestamps.push(now);
  _rateBuckets.set(ip, timestamps);
  next();
}

app.use(express.json());
app.use('/jp-ui', express.static(path.join(__dirname, '..', 'packages', 'jp-ui')));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* POST /api/lookup  { input: "見る", jj: false }  → result JSON */
app.post('/api/lookup', rateLimit, async (req, res) => {
  const { input, jj, forceMode } = req.body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }
  try {
    const result = await lookup(input.trim(), { jj: !!jj, forceMode: forceMode || null });
    res.json(result);
  } catch (err) {
    console.error('Lookup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/export?input=見る  → plain TSV */
app.get('/api/export', rateLimit, async (req, res) => {
  const { input } = req.query;
  if (!input) return res.status(400).send('input required');
  try {
    const result = await lookup(input.trim());
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(toAnkiTSV(result));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* POST /api/lookup/stream  { input: "見る", jj: false }  → SSE text/event-stream */
app.post('/api/lookup/stream', rateLimit, async (req, res) => {
  const { input, jj, forceMode } = req.body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  try {
    for await (const event of lookupStream(input.trim(), { jj: !!jj, forceMode: forceMode || null })) {
      if (event.type === 'chunk') {
        res.write(`data: ${JSON.stringify({ text: event.text })}\n\n`);
      } else if (event.type === 'done') {
        res.write(`data: ${JSON.stringify({ done: true, result: event.result })}\n\n`);
      }
    }
  } catch (err) {
    console.error('Stream error, falling back to lookup():', err.message);
    try {
      const result = await lookup(input.trim(), { jj: !!jj });
      res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr.message);
      res.write(`data: ${JSON.stringify({ error: fallbackErr.message })}\n\n`);
    }
  }
  res.end();
});

/* POST /api/paste/stream  { text, jj: false }  → SSE: identified → result* → done */
app.post('/api/paste/stream', rateLimit, async (req, res) => {
  const { text, jj } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const words = await identifyWords(text.trim());
    if (!words.length) {
      send({ type: 'error', message: '解析できる単語が見つかりませんでした' });
      return res.end();
    }
    send({ type: 'identified', words });

    /* Serial with pacing — parallel calls hit the output-token/min rate limit
       for pastes with 5+ words. 3s spacing keeps us well under the org limit. */
    const PASTE_SPACING_MS = 3000;
    const PASTE_MAX_RETRIES = 3;
    const PASTE_BACKOFF_MS = 65000;
    for (let i = 0; i < words.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, PASTE_SPACING_MS));
      const { word, sentence } = words[i];
      let attempt = 0;
      while (true) {
        try {
          const result = await lookup(word, { context: sentence, jj: !!jj });
          send({ type: 'result', word, result });
          break;
        } catch (err) {
          if (/\b429\b/.test(err.message) && attempt < PASTE_MAX_RETRIES) {
            attempt++;
            await new Promise(r => setTimeout(r, PASTE_BACKOFF_MS));
            continue;
          }
          send({ type: 'word_error', word, message: err.message });
          break;
        }
      }
    }

    send({ type: 'done' });
  } catch (err) {
    console.error('Paste stream error:', err.message);
    send({ type: 'error', message: err.message });
  }
  res.end();
});

/* GET /api/bunpro/status  → { enabled: bool } */
app.get('/api/bunpro/status', (req, res) => {
  res.json({ enabled: !!process.env.BUNPRO_TOKEN });
});

/* GET /api/bunpro/grammar?pattern=～てしまう  → { found, ...status } | { found:false } */
app.get('/api/bunpro/grammar', async (req, res) => {
  if (!process.env.BUNPRO_TOKEN) return res.status(503).json({ error: 'BUNPRO_TOKEN not set' });
  const { pattern } = req.query;
  if (!pattern) return res.status(400).json({ error: 'pattern required' });
  try {
    const status = await getGrammarStatus(pattern.trim());
    if (!status) return res.json({ found: false });
    res.json({ found: true, ...status });
  } catch (err) {
    console.error('BunPro grammar error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/* GET /api/bunpro/troubled?limit=50  → { items: [...] } */
app.get('/api/bunpro/troubled', async (req, res) => {
  if (!process.env.BUNPRO_TOKEN) return res.status(503).json({ error: 'BUNPRO_TOKEN not set' });
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  try {
    const items = await getTroubledGrammar({ limit });
    res.json({ items });
  } catch (err) {
    console.error('BunPro troubled error:', err.message);
    res.status(503).json({ error: err.message, hint: 'Is BUNPRO_API_KEY correct?' });
  }
});

/* GET /api/history  → { entries: [...] } */
app.get('/api/history', (req, res) => {
  res.json({ entries: getHistory() });
});

/* POST /api/history  { entry: resultObj }  → { entries: [...] } */
app.post('/api/history', (req, res) => {
  const { entry } = req.body;
  if (!entry || typeof entry !== 'object') return res.status(400).json({ error: 'entry required' });
  res.json({ entries: addEntry(entry) });
});

/* DELETE /api/history  { input, jj } → delete one  |  { all: true } → clear all */
app.delete('/api/history', (req, res) => {
  const { input, jj, all } = req.body;
  if (all) return res.json({ entries: clearEntries() });
  if (!input) return res.status(400).json({ error: 'input required' });
  res.json({ entries: deleteEntry(input, jj) });
});

/* PUT /api/history  { entries: [...] }  → merge into server history (dedup, cap 50) */
app.put('/api/history', (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
  res.json({ entries: mergeEntries(entries) });
});

const STRUGGLING_CACHE = path.join(__dirname, '..', 'data', 'struggling_cache.json');

function readStrugglingCache() {
  try { return JSON.parse(fs.readFileSync(STRUGGLING_CACHE, 'utf8')); } catch { return null; }
}

function writeStrugglingCache(data) {
  try { fs.writeFileSync(STRUGGLING_CACHE, JSON.stringify({ ...data, cachedAt: Date.now() }, null, 2)); } catch {}
}

/* GET /api/anki/struggling?minLapses=2&limit=50  → { cards, total } or cached fallback */
app.get('/api/anki/struggling', async (req, res) => {
  const minLapses = Math.max(1, parseInt(req.query.minLapses) || 2);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  try {
    const result = await getStrugglingCards({ minLapses, limit });
    writeStrugglingCache(result);
    res.json(result);
  } catch (err) {
    const cached = readStrugglingCache();
    if (cached) return res.json({ ...cached, fromCache: true });
    console.error('AnkiConnect error:', err.message);
    res.status(503).json({ error: err.message, hint: 'Is Anki open with AnkiConnect installed?' });
  }
});

/* GET /api/anki/card?word=見る  → { found, noteId, sentence, ... } */
app.get('/api/anki/card', async (req, res) => {
  const { word } = req.query;
  if (!word) return res.status(400).json({ error: 'word required' });
  try {
    const note = await findNoteForWord(word.trim());
    if (!note) return res.json({ found: false });
    res.json({ found: true, ...note });
  } catch (err) {
    console.error('AnkiConnect card lookup error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/* POST /api/anki/card/sentence  — replace sentence on existing note */
app.post('/api/anki/card/sentence', async (req, res) => {
  const { noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey, modelName, word, sentenceHtml } = req.body;
  if (!noteId || !sentenceFieldKey || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    await updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey, modelName, word, sentenceHtml);
    res.json({ ok: true });
  } catch (err) {
    console.error('AnkiConnect update error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/* POST /api/anki/card/create  — create new note { result, sentence } */
app.post('/api/anki/card/create', async (req, res) => {
  const { result, sentence } = req.body;
  if (!result || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    const noteId = await addNoteForWord(result, sentence);
    res.json({ ok: true, noteId });
  } catch (err) {
    console.error('AnkiConnect create error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/* POST /api/anki/card/enrich  — expand non-standard note type with companion fields + write all values */
app.post('/api/anki/card/enrich', async (req, res) => {
  const { noteId, modelName, result, sentence } = req.body;
  if (!noteId || !modelName || !result || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    await enrichAndUpdateCard(noteId, modelName, result, sentence.jp, sentence.translation, sentence.html);
    res.json({ ok: true });
  } catch (err) {
    console.error('AnkiConnect enrich error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/* POST /api/anki/grammar/create  — create new grammar note { result, sentence } */
app.post('/api/anki/grammar/create', async (req, res) => {
  const { result, sentence } = req.body;
  if (!result || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    const noteId = await addNoteForGrammar(result, sentence);
    res.json({ ok: true, noteId });
  } catch (err) {
    console.error('AnkiConnect grammar create error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/* GET /api/anki/decks  → { decks: string[] } */
app.get('/api/anki/decks', async (req, res) => {
  try {
    const decks = await getDeckNames();
    res.json({ decks });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Japanese Study Companion running at http://localhost:${PORT}`);
  console.log(`  (also reachable on all interfaces — LAN / Tailscale at port ${PORT})`);
});
