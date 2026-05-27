'use strict';

const crypto = require('crypto');
const express = require('express');
const { embed } = require('../embedder');
const vectorStore = require('../vectorStore');

let pdfParse;
try { pdfParse = require('pdf-parse'); } catch (_) {}

const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 50;
const CHUNK_STEP = CHUNK_SIZE - CHUNK_OVERLAP;
const MIN_CHUNK_LENGTH = 20;

const router = express.Router();

function secretsMatch(a, b) {
  if (!a || !b) return false;
  const ha = crypto.createHmac('sha256', 'eob-compare').update(a).digest();
  const hb = crypto.createHmac('sha256', 'eob-compare').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function chunkText(text) {
  const chunks = [];
  for (let start = 0; start < text.length; start += CHUNK_STEP) {
    const chunk = text.slice(start, start + CHUNK_SIZE);
    if (chunk.length >= MIN_CHUNK_LENGTH) chunks.push(chunk);
  }
  return chunks;
}

router.post('/', async (req, res) => {
  const provided = req.headers['x-ingest-secret'];
  const expected = process.env.INGEST_SECRET;
  if (!secretsMatch(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { filename, bucket } = req.body || {};
  if (typeof filename !== 'string' || filename.trim() === '') {
    return res.status(400).json({ error: 'filename must be a non-empty string' });
  }
  if (typeof bucket !== 'string' || bucket.trim() === '') {
    return res.status(400).json({ error: 'bucket must be a non-empty string' });
  }

  try {
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    const parsed = pdfParse ? await pdfParse(buffer) : { text: buffer.toString('utf8') };
    const rawText = parsed.text || '';
    const textChunks = chunkText(rawText);

    const newChunks = [];
    for (let i = 0; i < textChunks.length; i++) {
      const embedding = await embed(textChunks[i]);
      newChunks.push({ text: textChunks[i], source: filename, chunkIndex: i, embedding });
    }

    await vectorStore.append(newChunks);
    return res.status(200).json({ chunksAdded: newChunks.length, files: [filename] });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: 'Ingestion failed' });
  }
});

module.exports = router;
