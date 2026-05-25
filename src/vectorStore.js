'use strict';

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.resolve(process.cwd(), 'vector_store.json');

let store = [];

async function load() {
  try {
    const raw = await fs.promises.readFile(STORE_PATH, 'utf8');
    store = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      store = [];
    } else {
      throw err;
    }
  }
}

async function save(entries) {
  await fs.promises.writeFile(STORE_PATH, JSON.stringify(entries), 'utf8');
}

function search(queryEmbedding, topK) {
  if (store.length === 0) return [];
  const scored = store.map(entry => ({
    entry,
    score: cosine(queryEmbedding, entry.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => s.entry);
}

function storeSize() {
  return store.length;
}

function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { load, save, search, storeSize };
