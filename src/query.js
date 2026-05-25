'use strict';

const { embed } = require('./embedder');
const vectorStore = require('./vectorStore');
const { callLLM } = require('./llm');

const MIN_SCORE = 0.10;
const TOP_K = 6;

const SYSTEM_PROMPT = `You are an assistant that answers questions about insurance Explanation of Benefits (EOB) documents.
Answer using ONLY the document excerpts provided below. Do not use any outside knowledge.
All monetary amounts, reference numbers, and dates must be reproduced exactly as they appear in the source text. Never round, abbreviate, or reformat figures.
Describe only what the documents say. Do not advise on payment strategies, dispute procedures, appeals, or medical decisions.
End every answer with a line beginning "Source:" that names the document filename and the specific field cited.
If the provided excerpts do not contain enough information to answer, respond with exactly: I can't find that in your documents.`;

const FAIL_CLOSED = "I can't find that in your documents.";

async function queryPipeline(question) {
  const embedding = await embed(question);
  const vectorHits = vectorStore.searchWithScores(embedding, TOP_K, MIN_SCORE);

  const vectorKeys = new Set(vectorHits.map(h => `${h.source}::${h.chunkIndex}`));
  const questionWords = (question.toLowerCase().match(/\b\w{4,}\b/g) || []);
  const keywordHits = [];

  if (questionWords.length > 0) {
    for (const entry of vectorStore.getAll()) {
      const key = `${entry.source}::${entry.chunkIndex}`;
      if (vectorKeys.has(key)) continue;
      const lower = entry.text.toLowerCase();
      const matched = questionWords.some(word => {
        const re = new RegExp(`\\b${word}\\b`, 'g');
        return (lower.match(re) || []).length >= 2;
      });
      if (matched) {
        keywordHits.push({ text: entry.text, source: entry.source, chunkIndex: entry.chunkIndex, score: 0 });
      }
    }
  }

  const chunks = [...vectorHits, ...keywordHits];

  if (chunks.length === 0) {
    return { answer: FAIL_CLOSED, citations: [] };
  }

  const excerpts = chunks
    .map((c, i) => `[${i + 1}] source: ${c.source}\n${c.text}`)
    .join('\n\n');
  const userMessage = `Document excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;

  const answer = await callLLM(SYSTEM_PROMPT, userMessage);

  if (answer.trim() === FAIL_CLOSED) {
    return { answer: FAIL_CLOSED, citations: [] };
  }

  return {
    answer,
    citations: chunks.map(c => ({ source: c.source, excerpt: c.text, score: c.score })),
  };
}

module.exports = { queryPipeline };
