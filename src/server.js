/**
 * server.js — Express wrapper around lookup.js
 * Keeps ANTHROPIC_API_KEY server-side.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const { lookup, lookupStream, toAnkiTSV } = require('./lookup');
const { getStrugglingCards, findNoteForWord, updateCardSentence, addNoteForWord, getDeckNames, enrichAndUpdateCard } = require('./anki');

const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY — copy .env.example to .env');
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/* POST /api/lookup  { input: "見る" }  → result JSON */
app.post('/api/lookup', async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }
  try {
    const result = await lookup(input.trim());
    res.json(result);
  } catch (err) {
    console.error('Lookup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/export?input=見る  → plain TSV */
app.get('/api/export', async (req, res) => {
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

/* POST /api/lookup/stream  { input: "見る" }  → SSE text/event-stream */
app.post('/api/lookup/stream', async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  try {
    for await (const event of lookupStream(input.trim())) {
      if (event.type === 'chunk') {
        res.write(`data: ${JSON.stringify({ text: event.text })}\n\n`);
      } else if (event.type === 'done') {
        res.write(`data: ${JSON.stringify({ done: true, result: event.result })}\n\n`);
      }
    }
  } catch (err) {
    console.error('Stream error, falling back to lookup():', err.message);
    try {
      const result = await lookup(input.trim());
      res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr.message);
      res.write(`data: ${JSON.stringify({ error: fallbackErr.message })}\n\n`);
    }
  }
  res.end();
});

/* GET /api/anki/struggling?minLapses=2&limit=50  → { cards, total } */
app.get('/api/anki/struggling', async (req, res) => {
  const minLapses = Math.max(1, parseInt(req.query.minLapses) || 2);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  try {
    const result = await getStrugglingCards({ minLapses, limit });
    res.json(result);
  } catch (err) {
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
  const { noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey, modelName } = req.body;
  if (!noteId || !sentenceFieldKey || !sentence) return res.status(400).json({ error: 'missing fields' });
  try {
    await updateCardSentence(noteId, sentenceFieldKey, sentence, sentenceMeaning, sentenceMeaningKey, sentenceAudioKey, modelName);
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
    await enrichAndUpdateCard(noteId, modelName, result, sentence.jp, sentence.translation);
    res.json({ ok: true });
  } catch (err) {
    console.error('AnkiConnect enrich error:', err.message);
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

app.listen(PORT, () => {
  console.log(`Japanese Study Companion running at http://localhost:${PORT}`);
});
