'use strict';

const BASE = `http://localhost:${process.env.PORT || 3001}`;
let failures = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures++;
  }
}

async function run() {
  let res, body;

  res = await fetch(`${BASE}/api/health`);
  body = await res.json();
  assert(
    'GET /api/health → 200 with all required fields',
    res.status === 200 &&
    body.status === 'ok' &&
    typeof body.storeReady === 'boolean' &&
    typeof body.provider === 'string' &&
    typeof body.model === 'string' &&
    typeof body.timestamp === 'string'
  );

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is a deductible?' }),
  });
  body = await res.json();
  assert(
    'POST /api/query with matching question → 200, answer contains Source:, citations non-empty',
    res.status === 200 &&
    typeof body.answer === 'string' &&
    body.answer.length > 0 &&
    body.answer.includes('Source:') &&
    Array.isArray(body.citations) &&
    body.citations.length > 0 &&
    typeof body.citations[0].source === 'string' &&
    typeof body.citations[0].excerpt === 'string' &&
    typeof body.citations[0].score === 'number'
  );

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'xyzzy plugh zorkmid' }),
  });
  body = await res.json();
  assert(
    "POST /api/query with no-match question → 200, fail-closed response, empty citations",
    res.status === 200 &&
    body.answer === "I can't find that in your documents." &&
    Array.isArray(body.citations) &&
    body.citations.length === 0
  );

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert('POST /api/query with missing question → 400', res.status === 400);

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '' }),
  });
  assert('POST /api/query with empty question → 400', res.status === 400);

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 42 }),
  });
  assert('POST /api/query with non-string question → 400', res.status === 400);

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is a deductible?' }),
  });
  body = await res.json();
  assert(
    'POST /api/query with matching question → faithfulnessScore is a number between 0 and 1',
    res.status === 200 &&
    typeof body.faithfulnessScore === 'number' &&
    body.faithfulnessScore >= 0 &&
    body.faithfulnessScore <= 1
  );

  res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is the capital of France?' }),
  });
  body = await res.json();
  assert(
    "POST /api/query with irrelevant question → fail-closed response, no faithfulnessScore",
    res.status === 200 &&
    body.answer === "I can't find that in your documents." &&
    body.faithfulnessScore === undefined
  );

  process.exit(failures > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
