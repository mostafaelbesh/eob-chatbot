# Implementation Plan: NLI-based Anti-Hallucination Layer

**Feature**: 005-nli-anti-hallucination  
**Branch**: `005-nli-anti-hallucination`  
**Status**: Ready for implementation

---

## 1. Architecture & Design Decisions

### Model loading

Mirror the singleton pattern in `src/embedder.js` exactly:

```js
// src/nliChecker.js
'use strict';

const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

env.cacheDir = path.resolve(process.cwd(), '.xenova-cache');

let nliPipeline = null;

async function getNliPipeline() {
  if (!nliPipeline) {
    nliPipeline = await pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-small', { quantized: true });
  }
  return nliPipeline;
}
```

- `env.cacheDir` is set idempotently; both `embedder.js` and `nliChecker.js` set it to the same `.xenova-cache/` path. No conflict.
- `nliPipeline` is module-level, lazy-initialised on first `checkFaithfulness` call (cold start on first request, warm thereafter).
- No server-startup pre-loading; the first real query absorbs the warm-up cost (consistent with embedder behaviour).

### Hypothesis template

`zero-shot-classification` uses an NLI model internally. For each candidate label it constructs:

```
hypothesis = hypothesis_template.replace('{}', label)
NLI(premise=sequence, hypothesis=hypothesis)
```

The template used:

```
hypothesis_template: `The answer "${truncated}" is {} by this document excerpt.`
candidate_labels:    ['supported', 'not supported']
sequence:            chunk.text  (premise)
```

`truncated` = `answer.slice(0, 256)` — keeps the answer within NLI token limits (~512 tokens for DeBERTa).

This produces:
- `"The answer '<answer>' is supported by this document excerpt."` — score for entailment
- `"The answer '<answer>' is not supported by this document excerpt."` — score for contradiction

### Aggregation

Run all chunk checks concurrently with `Promise.all`. Take the **maximum** `supported` score across all chunks as `faithfulnessScore`:

```js
const scores = await Promise.all(chunks.map(c => scoreChunk(classifier, answer, c.text)));
const faithfulnessScore = Math.max(...scores);
```

Rationale: if **any** retrieved chunk strongly entails the answer, the answer is grounded. Averaging would dilute high-signal chunks with keyword-supplement chunks that only partially match.

### Thresholds

| Threshold | Constant | Behaviour |
|---|---|---|
| `< NLI_FAIL_THRESHOLD` (0.5) | `NLI_FAIL_THRESHOLD` | Override answer with FAIL_CLOSED, return empty citations |
| `>= 0.5, < 0.8` | — | Return answer + citations, no badge (`faithfulnessScore` included in response) |
| `>= NLI_BADGE_THRESHOLD` (0.8) | `NLI_BADGE_THRESHOLD` | Return answer + citations + badge trigger |

Both constants defined at the top of `src/nliChecker.js` for easy tuning.

---

## 2. Module Changes

### `src/nliChecker.js` — NEW FILE

Full module:

```js
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
```

No JSDoc, no inline explanatory comments, no section banners.

### `src/query.js` — MODIFY

Two changes:
1. Add `require('./nliChecker')` at the top alongside other imports.
2. After the LLM call and FAIL_CLOSED guard, invoke `checkFaithfulness` and handle the result.

Replace the final return block (currently lines 57–62):

```js
// BEFORE
const answer = await callLLM(SYSTEM_PROMPT, userMessage);

if (answer.trim() === FAIL_CLOSED) {
  return { answer: FAIL_CLOSED, citations: [] };
}

return {
  answer,
  citations: chunks.map(c => ({ source: c.source, excerpt: c.text, score: c.score })),
};
```

```js
// AFTER
const { checkFaithfulness, NLI_BADGE_THRESHOLD } = require('./nliChecker');

// ... (rest of pipeline unchanged until after callLLM) ...

const answer = await callLLM(SYSTEM_PROMPT, userMessage);

if (answer.trim() === FAIL_CLOSED) {
  return { answer: FAIL_CLOSED, citations: [] };
}

const { score, passed } = await checkFaithfulness(answer, chunks);

if (!passed) {
  return { answer: FAIL_CLOSED, citations: [] };
}

return {
  answer,
  citations: chunks.map(c => ({ source: c.source, excerpt: c.text, score: c.score })),
  faithfulnessScore: score,
};
```

Note: `require('./nliChecker')` belongs at the top of the file with the other requires, not inline.

### `client/src/App.jsx` — MODIFY

Two changes:

**1. Store `faithfulnessScore` in bot message state** (in the `try` block inside `submit`):

```js
// BEFORE
{
  id: crypto.randomUUID(),
  role: 'bot',
  text: data.answer,
  citations: data.citations ?? [],
  isRefusal,
  isError: false,
}
```

```js
// AFTER
{
  id: crypto.randomUUID(),
  role: 'bot',
  text: data.answer,
  citations: data.citations ?? [],
  isRefusal,
  isError: false,
  faithfulnessScore: data.faithfulnessScore ?? null,
}
```

**2. Render the "Verified" badge** — insert immediately after the `{msg.text}` paragraph and before the citations block, inside the bot message bubble. The badge renders only when `faithfulnessScore >= 0.8` and the message is not a refusal:

```jsx
{msg.role === 'bot' && !msg.isRefusal && !msg.isError &&
  msg.faithfulnessScore != null && msg.faithfulnessScore >= 0.8 && (
    <div
      style={{
        display: 'inline-block',
        marginTop: '0.625rem',
        padding: '0.25rem 0.75rem',
        backgroundColor: '#16a34a',
        color: '#ffffff',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      Verified against your documents
    </div>
  )}
```

Place this block between the `<p>` text element and the citations `<div>`, mirroring the position of the existing amber refusal badge below the message text.

### No other files need to change

- `src/server.js` — no change; `faithfulnessScore` passes through as part of the JSON response automatically.
- `src/ingest.js` — no change; NLI is query-time only.
- `src/vectorStore.js` — no change; chunk shape unchanged.

---

## 3. Data Flow

```
POST /api/query { question }
      │
      ▼
validate question (existing middleware)
      │
      ▼
embed(question) → queryEmbedding
      │
      ▼
vectorStore.searchWithScores() → vectorHits
      │
      ▼
keyword supplement → keywordHits
      │
      ▼
chunks = [...vectorHits, ...keywordHits]
      │
      ├─ chunks.length === 0 ──► return { answer: FAIL_CLOSED, citations: [] }
      │
      ▼
callLLM(SYSTEM_PROMPT, excerpts + question) → answer
      │
      ├─ answer === FAIL_CLOSED ──► return { answer: FAIL_CLOSED, citations: [] }
      │
      ▼
checkFaithfulness(answer, chunks)
  │  For each chunk (concurrent):
  │    nliPipeline(chunk.text, ['supported','not supported'], { template })
  │    → perChunkScore
  │  faithfulnessScore = max(perChunkScores)
  │  passed = faithfulnessScore >= NLI_FAIL_THRESHOLD (0.5)
      │
      ├─ !passed ──► return { answer: FAIL_CLOSED, citations: [] }
      │
      ▼
return {
  answer,
  citations: [...],
  faithfulnessScore   ← number 0–1
}
```

The client stores `faithfulnessScore` in message state. When rendering a bot message, if `faithfulnessScore >= 0.8`, the green badge is shown.

---

## 4. Performance Considerations

### Cold start (first request)

- `Xenova/nli-deberta-v3-small` quantized is ~85 MB on disk (downloaded once to `.xenova-cache/`).
- First call to `getNliPipeline()` triggers download + model load: **5–20 seconds** depending on network and hardware.
- Subsequent requests reuse the singleton: **0 ms overhead** for pipeline init.
- This mirrors exactly how the embedding model behaves; no special handling needed.

### Inference latency per request

- Each chunk produces one NLI call. With `TOP_K = 6` and keyword supplements, expect **6–10 NLI calls**.
- Quantized DeBERTa-v3-small: ~80–200 ms per call on a modern CPU.
- With `Promise.all` parallelisation: wall-clock NLI time **≈ single-chunk latency** (not × N), bounded by JS thread concurrency.
- Total added latency per warm request: approximately **100–300 ms**.

### Caching

- Model singleton in `nliPipeline` prevents repeated `pipeline()` calls.
- No result caching — NLI scores are cheap relative to the LLM call that precedes them.
- `.xenova-cache/` already populated by the embedding model run; DeBERTa downloads into the same directory.

---

## 5. Testing Approach

### `test-gold.js` — extend existing assertions

Add to the matching-question test (the `'What is a deductible?'` assertion):

```js
assert(
  'POST /api/query with matching question → response includes faithfulnessScore 0–1',
  res.status === 200 &&
  typeof body.faithfulnessScore === 'number' &&
  body.faithfulnessScore >= 0 &&
  body.faithfulnessScore <= 1
);
```

Add a separate assertion that the fail-closed path does NOT include `faithfulnessScore`:

```js
assert(
  'POST /api/query no-match → faithfulnessScore absent',
  body.faithfulnessScore === undefined
);
```

(This second assertion runs against the existing no-match `body` variable — no new request needed.)

### Manual smoke tests

**Badge visible:**
1. Start server (`npm start`) and client (`npm run dev:client`).
2. In browser, ask: `"What is my deductible?"` (requires a matching document in `data/`).
3. Expected: green "Verified against your documents" badge appears below the answer text.

**Badge absent on low-confidence answer:**
1. Ask a question where the answer exists but chunks are weakly related.
2. Expected: answer is returned, no badge.

**Fail-closed regression:**
1. Ask: `"xyzzy plugh zorkmid"`.
2. Expected: `"I can't find that in your documents."` — no badge, no citations.

**Cold-start warning:**
- First request after `npm start` will be slow (model download/load). This is expected and not a bug.

---

## 6. Non-Goals

- **No new npm packages** — `@xenova/transformers` is already installed; `Xenova/nli-deberta-v3-small` is a model weight download, not a package dependency.
- **No new API keys** — NLI runs entirely locally; no external service is called.
- **No new environment variables** — thresholds are hardcoded constants in `src/nliChecker.js`; tuning requires a code change.
- **No fine-tuning** — the quantized off-the-shelf model is used as-is.
- **No streaming changes** — the NLI check completes before the response is sent; no SSE or streaming protocol changes needed.
- **No caching of NLI scores** — results are not memoised across requests.
- **No UI explanation of the score** — the badge is binary (shown/not shown); the raw `faithfulnessScore` number is not displayed to the user.
- **No change to the FAIL_CLOSED message text** — the response string remains exactly `"I can't find that in your documents."`.
- **No health-check change** — `GET /api/health` does not need to report NLI model status.

---

## 7. Constitution Check

| Principle | Satisfied? | Notes |
|---|---|---|
| §1 Grounding-Only | ✅ | NLI check enforces grounding; low-score answers are suppressed |
| §2 Citations-Mandatory | ✅ | Citations still returned on passing answers; suppressed only on fail-closed |
| §3 Fail-Closed | ✅ | NLI check adds a second fail-closed gate after the LLM |
| §4 Exact-Figure Fidelity | ✅ | NLI operates post-generation; does not alter answer text |
| §5 Privacy Boundary | ✅ | NLI runs locally via `@xenova/transformers`; no new external calls |
| §6 No-Advice | ✅ | No change to system prompt or answer content |

---

## 8. Implementation Order

1. Create `src/nliChecker.js`.
2. Modify `src/query.js` — add import and post-LLM NLI check.
3. Modify `client/src/App.jsx` — store `faithfulnessScore`, render badge.
4. Extend `test-gold.js` with two new assertions.
5. Manual smoke test cold-start and badge rendering.
