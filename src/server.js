/**
 * server.js — Express wrapper around lookup.js
 * Keeps ANTHROPIC_API_KEY server-side.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const { lookup, toAnkiTSV } = require('./lookup');

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

app.listen(PORT, () => {
  console.log(`Japanese Study Companion running at http://localhost:${PORT}`);
});
