---
description: "Task list for Document Ingestion Pipeline implementation"
---

# Tasks: Document Ingestion Pipeline

**Branch**: `001-ingestion-pipeline` | **Date**: 2026-05-25

**Input**: Design documents from `specs/001-ingestion-pipeline/`

**Prerequisites used**: plan.md ✓ | spec.md ✓ | research.md ✓ | data-model.md ✓ | contracts/module-interfaces.md ✓ | quickstart.md ✓

**Tests**: No test tasks generated — spec specifies integration testing only via `npm run ingest` (no test framework).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared state)
- **[US#]**: User story this task belongs to (US1–US4 map to spec.md priorities P1–P3)
- Exact file paths included in every description

---

## Phase 1: Setup

**Purpose**: Project-level preparation before any source code is written.

- [x] T001 Verify `.gitignore` contains entries for `vector_store.json` and `.xenova-cache/`; add both if absent

**Checkpoint**: `.gitignore` protects generated artefacts from accidental commits — ready to begin implementation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two shared modules that `src/ingest.js` depends on for ALL user stories. Must be complete before any Phase 3+ work begins.

**⚠️ CRITICAL**: `src/ingest.js` cannot be implemented until both T002 and T003 are complete and their exported contracts verified.

- [x] T002 [P] Implement `src/embedder.js` — set `env.cacheDir` to `path.resolve(process.cwd(), '.xenova-cache')`, lazily initialise `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true })` singleton on first call, export `async function embed(text)` returning `Array` of 384 floats per `contracts/module-interfaces.md`
- [x] T003 [P] Implement `src/vectorStore.js` — module-level `let store = []`; async `load()` using `fs.promises.readFile` (empty array if file absent); async `save(entries)` using `fs.promises.writeFile` with compact `JSON.stringify`; sync `search(queryEmbedding, topK)` computing cosine similarity over in-memory store and returning top-K entries; sync `storeSize()` returning `store.length`; per `contracts/module-interfaces.md`

**Checkpoint**: Run `node -e "const e = require('./src/embedder'); const v = require('./src/vectorStore'); console.log(typeof e.embed, typeof v.load, typeof v.save, typeof v.search, typeof v.storeSize)"` — expected output: `function function function function function`

---

## Phase 3: User Story 1 — Ingest EOB Documents into Vector Store (Priority: P1) 🎯 MVP

**Goal**: A complete end-to-end run of `npm run ingest` that reads `.pdf` and `.txt` files, chunks and embeds all text, and writes a valid `vector_store.json`.

**Independent Test**: Place one `.txt` file in `./data/`, run `npm run ingest`, verify `vector_store.json` is a flat JSON array where every entry has `text`, `source`, `chunkIndex`, and `embedding` fields and the process exits with code `0`.

- [x] T004 [US1] Scaffold `src/ingest.js` `main()` async function — use `fs.readdirSync('./data')` to list files, filter to `.pdf` and `.txt` by lowercased extension, derive `source` with `path.basename()`
- [x] T005 [US1] Add text extraction to `src/ingest.js` — read `.txt` files with `fs.readFileSync(filePath, 'utf8')`; read `.pdf` files with `await pdfParse(fs.readFileSync(filePath))` and extract `.text`; skip files that yield empty or whitespace-only text
- [x] T006 [US1] Implement `chunkText(text)` function in `src/ingest.js` — sliding window with `CHUNK_SIZE = 300`, `CHUNK_OVERLAP = 50`, effective step `= 250`; loop `start = i * 250` until `start >= text.length`; call `text.slice(start, start + CHUNK_SIZE)`; discard chunks where `chunk.length < 20`; return `string[]`
- [x] T007 [US1] Wire embedding loop and store write in `src/ingest.js` — iterate all `DocumentChunk` objects, call `await embed(chunk.text)`, push `{ text, source, chunkIndex, embedding }` to results array; after loop call `await save(results)`; log `Ingested ${results.length} chunks from ${fileCount} file(s) → vector_store.json`; call `process.exit(0)`

**Checkpoint**: `npm run ingest` with a sample `.txt` in `./data/` produces `vector_store.json`; `node -e "const s=require('./vector_store.json'); console.log(s.length, Object.keys(s[0]).sort().join(','))"` prints count and `chunkIndex,embedding,source,text`.

---

## Phase 4: User Story 2 — Monitor Embedding Progress (Priority: P2)

**Goal**: The terminal shows a live counter (e.g. `Embedding chunk 3 / 42`) overwritten on one line during the embedding loop, with a clean newline on completion.

**Independent Test**: Run `npm run ingest` with multiple files; the counter updates in-place for every chunk and exactly one new line is emitted after the loop ends.

- [x] T008 [US2] Add progress counter to the embedding loop in `src/ingest.js` — before the loop calculate `total = chunks.length`; inside the loop after each `embed()` call write `process.stdout.write(\`\rEmbedding chunk ${done} / ${total}  \`)` (trailing spaces clear leftover characters); after the loop write `process.stdout.write('\n')`

**Checkpoint**: Running `npm run ingest` shows a single line that updates in-place and the summary log appears on a fresh line immediately after.

---

## Phase 5: User Story 3 — Graceful Degradation Without PDF Support (Priority: P3)

**Goal**: When `pdf-parse` is not installed, the script warns per skipped PDF and completes successfully processing any `.txt` files.

**Independent Test**: Temporarily move `node_modules/pdf-parse` aside, run `npm run ingest` with one `.pdf` and one `.txt` in `./data/`; verify the `.txt` is processed, a `console.warn` message names the skipped PDF, and exit code is `0`.

- [x] T009 [US3] Add optional `pdf-parse` detection in `src/ingest.js` — at the top of the file: `let pdfParse; try { pdfParse = require('pdf-parse'); } catch (_) {}`; in the extraction step for `.pdf` files: when `pdfParse` is `undefined` call `console.warn(\`pdf-parse not available — skipping ${source}\`)` and `continue` to the next file

**Checkpoint**: With `pdf-parse` removed and mixed file types in `./data/`, the script warns about each `.pdf`, processes `.txt` files, writes `vector_store.json`, and exits `0`.

---

## Phase 6: User Story 4 — No Eligible Files Found (Priority: P3)

**Goal**: When no eligible files produce any chunks, the script prints an informative message and exits with code `1`.

**Independent Test**: Run `npm run ingest` with an empty `./data/`; output contains a "no eligible files" message and `$LASTEXITCODE` (PowerShell) or `$?` (Unix) indicates failure.

- [x] T010 [US4] Add no-eligible-files guard in `src/ingest.js` — after the chunking step and before the embedding loop, if `chunks.length === 0` print `No eligible files found in ./data/` to stdout and call `process.exit(1)`

**Checkpoint**: Empty `./data/` → process exits with code `1`; `./data/` with only `.pdf` files and `pdf-parse` absent → all PDFs warned, exit code `1`.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and integration validation across all user stories.

- [x] T011 [P] Verify all four spec edge cases in `src/ingest.js` are handled: (a) `./data/` directory missing → informative error + exit 1; (b) empty `.txt` file → no chunks produced (no crash); (c) PDF with no extracted text → zero chunks, no crash; (d) all chunks filtered out → exit code 1 via T010 guard
- [x] T012 Run full integration validation per `specs/001-ingestion-pipeline/quickstart.md` — place representative `.txt` (and `.pdf` if available) in `./data/`, run `npm run ingest`, confirm `vector_store.json` schema passes the spot-check command in quickstart.md, confirm exit code `0`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
  └─▶ Phase 2 (Foundational) — T002 and T003 can run in parallel
        └─▶ Phase 3 (US1) — sequential T004 → T005 → T006 → T007
              └─▶ Phase 4 (US2) — T008 extends T007's loop
                    └─▶ Phase 5 (US3) — T009 extends T005's extraction step
                          └─▶ Phase 6 (US4) — T010 inserts guard before T007's loop
                                └─▶ Phase 7 (Polish)
```

### User Story Dependencies

| Story | Depends on | Can start after |
|---|---|---|
| US1 (P1) | T002 (embed), T003 (vectorStore) | Phase 2 complete |
| US2 (P2) | US1 embedding loop (T007) | T007 complete |
| US3 (P3) | US1 extraction step (T005) | T005 complete |
| US4 (P3) | US1 chunk collection (T006) | T006 complete |

US3 and US4 both modify `src/ingest.js` in independent locations. They can be implemented by a single session sequentially (US3 then US4) without conflict.

### Within Each Phase

- **Phase 2**: T002 and T003 are fully independent — different files, no shared state. Run concurrently.
- **Phase 3**: T004 → T005 → T006 → T007 are sequential — each task adds to the previous task's scaffold in `src/ingest.js`.
- **Phase 4–6**: Each adds one targeted change to `src/ingest.js`; sequential.

---

## Parallel Execution Example

### Phase 2 — Two parallel sessions

**Session A** works on T002:
```
Implement src/embedder.js
  - const { pipeline, env } = require('@xenova/transformers')
  - env.cacheDir = path.resolve(process.cwd(), '.xenova-cache')
  - let extractor = null
  - async function embed(text) { ... }
  - module.exports = { embed }
```

**Session B** works on T003 simultaneously:
```
Implement src/vectorStore.js
  - const fs = require('fs')
  - const path = require('path')
  - let store = []
  - async function load() { ... }
  - async function save(entries) { ... }
  - function search(queryEmbedding, topK) { ... }
  - function storeSize() { return store.length }
  - module.exports = { load, save, search, storeSize }
```

Both complete → proceed to Phase 3 (US1).

### Phase 3 — Sequential implementation of `src/ingest.js`

```
T004: scaffold main(), file scanner
  ↓
T005: text extraction (.txt readFileSync, .pdf pdfParse)
  ↓
T006: chunkText() sliding-window function
  ↓
T007: embedding loop + save() + exit 0
```

### Suggested MVP Scope

**US1 alone (T001–T007)** is a complete, independently deployable MVP. It produces a working `vector_store.json` that the chatbot's `src/query.js` can immediately use. US2–US4 improve operator experience and robustness but do not block the core RAG pipeline.
