'use strict';

const fs = require('fs');
const path = require('path');
const { embed } = require('./embedder');
const { save } = require('./vectorStore');

let pdfParse;
try { pdfParse = require('pdf-parse'); } catch (_) {}

const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 50;
const CHUNK_STEP = CHUNK_SIZE - CHUNK_OVERLAP;
const MIN_CHUNK_LENGTH = 20;
const DATA_DIR = path.resolve(process.cwd(), 'data');

function chunkText(text) {
  const chunks = [];
  for (let start = 0; start < text.length; start += CHUNK_STEP) {
    const chunk = text.slice(start, start + CHUNK_SIZE);
    if (chunk.length >= MIN_CHUNK_LENGTH) chunks.push(chunk);
  }
  return chunks;
}

async function main() {
  let files;
  try {
    files = fs.readdirSync(DATA_DIR);
  } catch (_) {
    console.log('No data directory found at ./data/');
    process.exit(1);
  }

  const eligible = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ext === '.pdf' || ext === '.txt';
  });

  const chunks = [];
  let fileCount = 0;

  for (const file of eligible) {
    const source = path.basename(file);
    const filePath = path.join(DATA_DIR, file);
    const ext = path.extname(file).toLowerCase();
    let text = '';

    if (ext === '.txt') {
      text = fs.readFileSync(filePath, 'utf8');
    } else if (ext === '.pdf') {
      if (!pdfParse) {
        console.warn(`pdf-parse not available — skipping ${source}`);
        continue;
      }
      const result = await pdfParse(fs.readFileSync(filePath));
      text = result.text;
    }

    if (!text || !text.trim()) continue;

    const textChunks = chunkText(text);
    if (textChunks.length === 0) continue;

    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({ text: textChunks[i], source, chunkIndex: i });
    }
    fileCount++;
  }

  if (chunks.length === 0) {
    console.log('No eligible files found in ./data/');
    process.exit(1);
  }

  const total = chunks.length;
  const results = [];
  let done = 0;

  for (const chunk of chunks) {
    const embedding = await embed(chunk.text);
    results.push({ text: chunk.text, source: chunk.source, chunkIndex: chunk.chunkIndex, embedding });
    done++;
    process.stdout.write(`\rEmbedding chunk ${done} / ${total}  `);
  }
  process.stdout.write('\n');

  await save(results);
  console.log(`Ingested ${results.length} chunks from ${fileCount} file(s) → vector_store.json`);
  process.exit(0);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
