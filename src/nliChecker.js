'use strict';

const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

env.cacheDir = path.resolve(process.cwd(), '.xenova-cache');

const NLI_FAIL_THRESHOLD = 0.5;
const NLI_BADGE_THRESHOLD = 0.8;

let nliPipeline = null;

async function getNliPipeline() {
  if (!nliPipeline) {
    nliPipeline = await pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-small', { quantized: true });
  }
  return nliPipeline;
}

async function scoreChunk(classifier, answer, chunkText) {
  const truncated = answer.slice(0, 256);
  const result = await classifier(
    chunkText,
    ['supported', 'not supported'],
    { hypothesis_template: `The answer "${truncated}" is {} by this document excerpt.` }
  );
  const idx = result.labels.indexOf('supported');
  return idx === -1 ? 0 : result.scores[idx];
}

async function checkFaithfulness(answer, chunks) {
  const classifier = await getNliPipeline();
  const scores = await Promise.all(chunks.map(c => scoreChunk(classifier, answer, c.text)));
  const score = scores.length > 0 ? Math.max(...scores) : 0;
  return { score, passed: score >= NLI_FAIL_THRESHOLD };
}

module.exports = { checkFaithfulness, NLI_BADGE_THRESHOLD };
