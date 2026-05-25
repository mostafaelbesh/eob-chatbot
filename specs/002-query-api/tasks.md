---

description: "Task list template for feature implementation"
---

# Tasks: Query API

**Input**: Design documents from `/specs/002-query-api/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api-endpoints.md](contracts/api-endpoints.md)

**Source files**:
- `src/vectorStore.js` — EXTEND: add `searchWithScores()`
- `src/llm.js` — NEW
- `src/query.js` — NEW
- `src/server.js` — NEW
- `test-gold.js` — NEW (explicitly requested in plan)

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (different files, no dependencies on in-progress tasks)
- **[US#]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: Confirm environment configuration before any source code is written.

- [x] T001 Create `.env.example` at project root with variables `PORT`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ALLOWED_ORIGINS` (one per line, with placeholder values and inline notes on defaults)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three modules that every user story depends on. All three touch different files and can be authored in parallel.

**⚠️ CRITICAL**: No user story route work can begin until T002, T003, and T004 are complete.

- [x] T002 [P] Add `searchWithScores(queryEmbedding, topK, minScore)` to `src/vectorStore.js` — function iterates `store`, computes cosine similarity for each entry, filters to entries where score ≥ minScore, sorts descending, slices to topK, returns `Array<{text, source, chunkIndex, score}>`; export alongside existing exports
- [x] T003 [P] Create `src/llm.js` — module-level `let client = null`; export `async callLLM(systemPrompt, userMessage)`: lazy-init `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` on first call; call `client.messages.create({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] })`; return `response.content[0].text`
- [x] T004 [P] Create `src/server.js` skeleton — `require('dotenv').config()` as first statement; create Express `app`; configure `cors()` with dynamic `origin` callback: split `ALLOWED_ORIGINS` env var on `,`, trim, allow request if origin is in list or absent, reject all others (never emit `*`); mount `express.json()`; define `async function main()` that calls `await vectorStore.load()` then `app.listen(PORT)`; add global `(err, req, res, next)` error handler that sends `{ error: 'Internal server error' }` with no stack trace; export `app`

**Checkpoint**: T002, T003, T004 all complete — user story implementation can now begin.

---

## Phase 3: User Stories 1 & 2 — Query Pipeline: Grounded Answer + Fail-Closed (Priority: P1) 🎯 MVP

**Goal**: `POST /api/query` returns a grounded answer with citations when relevant content exists, or the exact fixed refusal `"I can't find that in your documents."` (without calling the LLM) when no relevant content is found.

**Note**: US1 and US2 are implemented by the same `src/query.js` function — two branches of a single pipeline. They are grouped in one phase because separating them would require partial implementation of `query.js`.

**Independent Test**: Start server (`npm start`). Send `curl -X POST localhost:3001/api/query -H 'Content-Type: application/json' -d '{"question":"What is my deductible?"}'` → expect HTTP 200 with `answer` string ending in `Source:` and non-empty `citations`. Send a nonsense question → expect HTTP 200 with `{ "answer": "I can't find that in your documents.", "citations": [] }`.

- [x] T005 [US1] Create `src/query.js` — export `async function queryPipeline(question)`; constants `MIN_SCORE = 0.10` and `TOP_K = 6`; steps: (1) `await embed(question)` from `./embedder`; (2) `vectorStore.searchWithScores(embedding, TOP_K, MIN_SCORE)` → `vectorHits`; (3) keyword supplement: lowercase question words ≥ 4 chars, scan all store entries for any word appearing ≥ 2 times in `entry.text`, collect matches not already in vectorHits by `chunkIndex`+`source` equality, assign `score: 0`; (4) combine `vectorHits` + `keywordHits` → `chunks`; (5) **§3 guard**: if `chunks.length === 0` return `{ answer: "I can't find that in your documents.", citations: [] }` immediately before any LLM call; (6) build `systemPrompt` enforcing §1 (context-only), §4 (verbatim figures), §6 (no advice), §2 (end with `Source:` line); (7) build `userMessage` as numbered excerpt list `[N] source: <filename>\n<text>` followed by the question; (8) `answer = await callLLM(systemPrompt, userMessage)`; (9) return `{ answer, citations: chunks.map(c => ({ source: c.source, excerpt: c.text, score: c.score })) }`
- [x] T006 [US1] Add `POST /api/query` route to `src/server.js` — `const { queryPipeline } = require('./query')`; inside handler validate `question` (typeof check + `.trim()` length check) returning `res.status(400).json({ error: 'question must be a non-empty string' })` on failure; call `await queryPipeline(question)`; `res.json(result)`; wrap in `try/catch` forwarding to `next(err)` for the global error handler

**Checkpoint**: US1 and US2 are fully functional. `npm start` + curl confirms both the happy path and fail-closed path.

---

## Phase 4: User Story 3 — Input Validation (Priority: P1)

**Goal**: All three malformed-request variants return HTTP 400 with a safe error body before any query pipeline logic runs.

**Independent Test**: Three curl commands — `curl -X POST localhost:3001/api/query -d '{}'`, `curl -X POST localhost:3001/api/query -d '{"question":""}'`, `curl -X POST localhost:3001/api/query -d '{"question":42}'` — each return HTTP 400 `{ "error": "question must be a non-empty string" }` with no stack trace.

- [x] T007 [US3] Harden `POST /api/query` validation in `src/server.js` — confirm the handler covers all three FR-002 cases: (a) `req.body.question` is `undefined`/absent → 400; (b) `typeof req.body.question !== 'string'` → 400; (c) `req.body.question.trim() === ''` → 400; ensure validation block precedes `queryPipeline()` call with no early-exit gap; verify error body is exactly `{ error: 'question must be a non-empty string' }` matching the contract in `contracts/api-endpoints.md`

**Checkpoint**: US3 independently verifiable. All three bad-input variants return 400 with safe message.

---

## Phase 5: User Story 4 — Health Check (Priority: P2)

**Goal**: `GET /api/health` returns HTTP 200 with all five required fields.

**Independent Test**: `curl localhost:3001/api/health` → HTTP 200 `{ "status": "ok", "provider": "anthropic", "model": "claude-sonnet-4-6", "storeReady": true, "timestamp": "<ISO string>" }`.

- [x] T008 [US4] Add `GET /api/health` route to `src/server.js` — return `res.json({ status: 'ok', provider: 'anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', storeReady: vectorStore.storeSize() > 0, timestamp: new Date().toISOString() })`

**Checkpoint**: US4 independently verifiable. Health route responds before and after store load.

---

## Phase 6: User Story 5 — CORS Enforcement (Priority: P2)

**Goal**: Browser requests from listed origins receive CORS headers; requests from unlisted origins are blocked; wildcard is never emitted.

**Independent Test**: `curl -H "Origin: http://localhost:5173" localhost:3001/api/health` includes `Access-Control-Allow-Origin: http://localhost:5173`. `curl -H "Origin: http://evil.example.com" localhost:3001/api/health` receives no `Access-Control-Allow-Origin` header.

- [x] T009 [US5] Complete CORS origin callback in `src/server.js` — ensure `ALLOWED_ORIGINS` env var is split on `,` and each token trimmed; in the `origin` callback: if `!requestOrigin` (no-Origin header, same-origin/non-browser) call `cb(null, true)`; else if `allowedList.includes(requestOrigin)` call `cb(null, true)`; else call `cb(new Error('Not allowed by CORS'))`; confirm `cors({ origin: callback, credentials: false })` — never `cors()` without an origin restriction or `origin: '*'`

**Checkpoint**: US5 independently verifiable. CORS headers correct for listed origin, absent for unlisted.

---

## Phase 7: Polish & Gold Tests

**Purpose**: End-to-end validation and final smoke test.

- [x] T010 [P] Create `test-gold.js` at project root — 6 sequential `fetch` assertions against `http://localhost:${PORT || 3001}` using Node 20 built-in `fetch`; assertion helper logs `PASS`/`FAIL` and sets a flag; exits `process.exit(failures > 0 ? 1 : 0)`; assertions: (1) `GET /api/health` → status 200, body has `status === 'ok'`, `storeReady` is boolean, `provider` and `model` are strings, `timestamp` is a string; (2) `POST /api/query` with a question word present in `vector_store.json` → status 200, `answer` is non-empty string containing `Source:`, `citations` is non-empty array each with `source`, `excerpt`, `score`; (3) `POST /api/query` with `{ question: "xyzzy plugh zorkmid" }` → status 200, `answer === "I can't find that in your documents."`, `citations` is empty array; (4) `POST /api/query` with `{}` → status 400; (5) `POST /api/query` with `{ question: "" }` → status 400; (6) `POST /api/query` with `{ question: 42 }` → status 400
- [x] T011 Follow `specs/002-query-api/quickstart.md` — start server with `npm start`, confirm startup log shows store loaded and server listening, run `node test-gold.js`, confirm all 6 assertions pass and exit code is 0

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (env config known); T002, T003, T004 are mutually independent [P]
- **Phase 3 (US1+US2)**: Requires T002 (searchWithScores), T003 (callLLM), T004 (server skeleton) — all of Phase 2
- **Phase 4 (US3)**: Requires T006 (POST handler exists to harden)
- **Phase 5 (US4)**: Requires T004 (server.js exists); can start after Phase 2
- **Phase 6 (US5)**: Requires T004 (CORS middleware exists to complete)
- **Phase 7 (Polish)**: Requires all user story phases complete

### User Story Dependencies

| Story | Depends on | Blocks |
|---|---|---|
| US1+US2 (Phase 3) | Phase 2 complete | Phase 4, Phase 7 |
| US3 (Phase 4) | T006 (Phase 3) | Phase 7 |
| US4 (Phase 5) | Phase 2 complete | Phase 7 |
| US5 (Phase 6) | Phase 2 complete | Phase 7 |

### Within-Phase Task Order

- Phase 2: T002 → T003 [P], T004 [P] (T003 and T004 parallel; both can also parallel with T002 since different files)
- Phase 3: T005 → T006 (T006 requires query.js to exist)
- All server.js modifications (T006, T007, T008, T009) are sequential

### Parallel Opportunities

**Phase 2** (maximum parallelism — three different files):
```
T002  src/vectorStore.js  ─┐
T003  src/llm.js           ├─ all parallel
T004  src/server.js        ─┘
```

**Phases 5, 6** (after Phase 2, independent of Phase 3):
```
Phase 3 ──► T005 → T006 → T007
Phase 5 ──► T008                  ← can start after Phase 2
Phase 6 ──► T009                  ← can start after Phase 2
```

**Phase 7**:
```
T010 test-gold.js creation [P]  ← can overlap with final review
T011 smoke test                 ← requires server + T010
```

---

## Implementation Strategy

**MVP scope (minimum to deliver value)**: Phase 1 + Phase 2 + Phase 3 = T001–T006. At this point `POST /api/query` answers questions grounded in the vector store and fails closed when nothing is found. All six response principles (§1–§6) are enforced.

**Full delivery**: Add Phase 4 (validation hardening, T007) → Phase 5 (health, T008) → Phase 6 (CORS, T009) → Phase 7 (gold tests, T010–T011).

**Sequencing recommendation**: Complete Phase 2 tasks in parallel, then Phase 3 sequentially (T005 before T006), then Phases 4–6 can interleave since they each touch server.js in sequence.
