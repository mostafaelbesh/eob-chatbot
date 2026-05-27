---

description: "Task list for 004-supabase-storage-ingest"
---

# Tasks: Supabase Storage Ingest

**Input**: Design documents from `/specs/004-supabase-storage-ingest/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/api-endpoints.md ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US#]**: User story this task belongs to
- All tasks include exact file paths

---

## Phase 1: Setup

**Purpose**: Add required environment variables to project configuration

- [x] T001 Add `SUPABASE_URL=` and `INGEST_SECRET=` placeholder entries to `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: `vectorStore.append()` must exist before the ingest route can call it — blocks US1, US4

**⚠️ CRITICAL**: No user story pipeline work can begin until T002 is complete

- [x] T002 Add `async function append(newEntries)` to `src/vectorStore.js`: push each entry onto the in-memory `store` array then persist the full store with `fs.promises.writeFile(STORE_PATH, JSON.stringify(store), 'utf8')`; export `append` alongside existing exports

**Checkpoint**: `vectorStore.append` callable from route code — user story implementation can begin

---

## Phase 3: User Story 2 — Unauthorized Requests Are Rejected (Priority: P1)

**Goal**: Every request to `POST /api/ingest` without a valid `x-ingest-secret` header is rejected with HTTP 401 before any download or vector store access occurs

**Independent Test**: `curl -X POST http://localhost:3001/api/ingest -H "Content-Type: application/json" -d '{}'` → HTTP 401 `{ "error": "Unauthorized" }`; repeat with wrong secret value → still HTTP 401

- [x] T003 [US2] Create `src/routes/ingest.js`: declare Express Router; implement a `secretsMatch(a, b)` helper using `crypto.createHmac('sha256', 'eob-compare').update(input).digest()` and `crypto.timingSafeEqual`; in the `POST /` handler, read `req.headers['x-ingest-secret']` and `process.env.INGEST_SECRET`; if either is falsy or `secretsMatch` returns false return `res.status(401).json({ error: 'Unauthorized' })` immediately
- [x] T004 [US2] Mount the ingest router in `src/server.js` with `app.use('/api/ingest', require('./routes/ingest'))` before the static-files middleware

**Checkpoint**: Server running — unauthenticated and wrong-secret requests return 401 with no side-effects

---

## Phase 4: User Story 3 — Malformed Requests Are Rejected (Priority: P1)

**Goal**: Requests passing auth but carrying a missing or empty `filename` or `bucket` are rejected with HTTP 400 and a field-specific error message before any download is attempted

**Independent Test**: Valid `x-ingest-secret` + `{ "filename": "", "bucket": "eob-chatbot-bucket" }` → HTTP 400 `{ "error": "filename must be a non-empty string" }`; same for absent `bucket`

- [x] T005 [US3] Add body validation to the `POST /` handler in `src/routes/ingest.js` after the auth check: verify `typeof filename === 'string' && filename.trim() !== ''`; if not, return `res.status(400).json({ error: 'filename must be a non-empty string' })`; repeat for `bucket`

**Checkpoint**: Auth-passing requests with bad bodies return 400 with the exact field name in the error — no download triggered

---

## Phase 5: User Story 1 — Automation Triggers Ingestion (Priority: P1) 🎯 MVP

**Goal**: A fully valid request downloads the named PDF from Supabase Storage, processes it through the chunk → embed → append pipeline, and returns HTTP 200 with `{ chunksAdded, files }`

**Independent Test**: `curl -X POST http://localhost:3001/api/ingest -H "Content-Type: application/json" -H "x-ingest-secret: <secret>" -d '{"filename":"eob-2024-q1.pdf","bucket":"eob-chatbot-bucket"}'` → HTTP 200 `{ "chunksAdded": N, "files": ["eob-2024-q1.pdf"] }`; `storeSize()` increases by N

- [x] T006 [US1] Implement Supabase PDF download in `src/routes/ingest.js`: construct the URL as `` `${process.env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}` ``; call `fetch(url)`; store response for pipeline use
- [x] T007 [US1] Implement the chunk → embed pipeline in `src/routes/ingest.js`: declare constants `CHUNK_SIZE=300`, `CHUNK_OVERLAP=50`, `CHUNK_STEP=250`, `MIN_CHUNK_LENGTH=20` and inline `chunkText(text)` function; convert the fetch response to `Buffer.from(await response.arrayBuffer())`; call `pdfParse(buffer)` to extract text; for each chunk call `embed(chunkText)` from `src/embedder.js`; build `newChunks` array of `{ text, source: filename, chunkIndex, embedding }` objects
- [x] T008 [US1] Call `vectorStore.append(newChunks)` then return `res.status(200).json({ chunksAdded: newChunks.length, files: [filename] })` in `src/routes/ingest.js`

**Checkpoint**: Full round-trip working — real PDF in Supabase bucket ingested, vector store grows, 200 returned

---

## Phase 6: User Story 4 — Download or Processing Failure Returns a Safe Error (Priority: P2)

**Goal**: Any failure after validation (non-200 fetch, PDF parse error, embed error, append error) produces exactly HTTP 500 `{ "error": "Ingestion failed" }` with no internal details in the response

**Independent Test**: Valid secret + filename that does not exist in the bucket → HTTP 500 `{ "error": "Ingestion failed" }`; response body contains no stack trace or file path

- [x] T009 [US4] Wrap the download + parse + chunk + embed + append block in `src/routes/ingest.js` in a `try/catch`; inside the try, after `fetch(url)`, check `if (!response.ok) throw new Error(...)` to surface non-200 HTTP from Supabase as a caught error; in the catch block `console.error(err.message)` and return `res.status(500).json({ error: 'Ingestion failed' })`; no `err.stack` or `err.message` in the HTTP response body

**Checkpoint**: Request with non-existent filename returns 500 with exact `{ "error": "Ingestion failed" }` body; server console shows the real error

---

## Phase 7: User Story 5 — Local CLI Ingestion Continues to Work (Priority: P2)

**Goal**: `npm run ingest` with PDFs in `./data/` exits 0 and populates `vector_store.json` identically to pre-feature behaviour; no regression from adding `append()` to `vectorStore.js`

**Independent Test**: `npm run ingest` with one PDF in `./data/` → exit code 0; vector store contains chunks with `source` matching that filename

- [x] T010 [US5] Verify `src/ingest.js` is byte-for-byte unchanged; confirm `src/vectorStore.js` all five original exports (`load`, `save`, `searchWithScores`, `getAll`, `storeSize`) are unmodified and `append` is the only addition
- [x] T011 [US5] Place a PDF in `./data/` and run `npm run ingest`; confirm exit code 0, console reports chunk count, and `vector_store.json` contains entries with the expected `source` filename

**Checkpoint**: CLI workflow fully intact — local re-indexing unaffected by new endpoint

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end scenario validation and query-pipeline regression gate

- [x] T012 [P] Smoke-test all five curl scenarios from `specs/004-supabase-storage-ingest/quickstart.md` against the running server: happy path (200), no secret (401), wrong secret (401), empty filename (400), non-existent file (500)
- [x] T013 [P] Run `node test-gold.js` and confirm all 6 gold assertions pass — verifies query pipeline is regression-free after the `vectorStore.js` change

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks all user story phases**
- **Phase 3 (US2)**: Depends on Foundational — auth skeleton needed before any story is testable
- **Phase 4 (US3)**: Depends on Phase 3 — builds on the same route handler
- **Phase 5 (US1)**: Depends on Phase 4 and Foundational — pipeline needs auth + validation guards in place and `append()` available
- **Phase 6 (US4)**: Depends on Phase 5 — wraps the pipeline already implemented in US1
- **Phase 7 (US5)**: Depends on Phase 2 only — CLI verification is independent of route work; can run after T002
- **Polish (Phase 8)**: Depends on all story phases complete

### User Story Dependencies

| Story | Depends On | Notes |
|-------|------------|-------|
| US2 (T003–T004) | Foundational (T002) | Route scaffold requires `vectorStore` module to load cleanly |
| US3 (T005) | US2 (T003) | Validation lives in the same handler file as auth |
| US1 (T006–T008) | US2, US3, Foundational | Pipeline needs guards in place and `append()` available |
| US4 (T009) | US1 (T006–T008) | try/catch wraps the pipeline implemented in US1 |
| US5 (T010–T011) | Foundational (T002) | Only depends on `vectorStore.js` change being backward-compat |

### Within Each User Story

- Auth check (US2) before validation (US3) before pipeline (US1) before error wrapper (US4)
- This mirrors the execution order within `src/routes/ingest.js`

### Parallel Opportunities

- T012 and T013 in Phase 8 are fully independent [P] — can run simultaneously
- US5 (T010–T011) and US4 (T009) can proceed in parallel once US1 is complete
- T001 (env.example) can be done any time during Phase 1

---

## Parallel Example: Phase 8

```
After Phase 7 completes:
├── T012 [P] Smoke-test quickstart.md scenarios
└── T013 [P] Run test-gold.js regression suite
```

---

## Implementation Strategy

**MVP scope (Phases 1–5)**: Delivers the full happy path — n8n can trigger ingestion and the vector store grows. Auth, validation, download, pipeline, and success response all working.

**Increment 2 (Phase 6)**: Adds the error safety net — n8n receives a clean 500 on failures instead of an unhandled crash.

**Increment 3 (Phase 7)**: Confirms the CLI fallback is untouched.

**Gate (Phase 8)**: Validates the complete contract and ensures zero query-pipeline regression.
