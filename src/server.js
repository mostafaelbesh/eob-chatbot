'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const vectorStore = require('./vectorStore');
const { queryPipeline } = require('./query');

const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();

app.use(cors({
  origin(requestOrigin, cb) {
    if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: false,
}));

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'anthropic',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    storeReady: vectorStore.storeSize() > 0,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/query', async (req, res, next) => {
  const { question } = req.body || {};
  if (typeof question !== 'string' || question.trim() === '') {
    return res.status(400).json({ error: 'question must be a non-empty string' });
  }
  try {
    const result = await queryPipeline(question);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  await vectorStore.load();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

module.exports = app;
