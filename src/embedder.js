'use strict';

const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

env.cacheDir = path.resolve(process.cwd(), '.xenova-cache');

let extractor = null;

async function embed(text) {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

module.exports = { embed };
