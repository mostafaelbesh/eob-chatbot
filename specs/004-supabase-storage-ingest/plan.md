# Implementation Plan: Supabase Storage Ingest

**Branch**: `004-supabase-storage-ingest` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-supabase-storage-ingest/spec.md`

## Summary

Add `POST /api/ingest` to the Express server so an n8n automation can trigger ingestion of PDFs uploaded to a public Supabase Storage bucket. The server authenticates via a shared `x-ingest-secret` header (HMAC timing-safe comparison against `INGEST_SECRET` env var), downloads the PDF using Node 20 built-in `fetch`, runs the existing chunk → embed pipeline, appends new chunks to the in-memory vector store and persists the result, then responds synchronously with `{ chunksAdded, files }`. The local `npm run ingest` CLI is entirely unchanged (FR-008).

## Technical Context

**Language/Version**: Node 20 (CJS, `'use strict'`)

**Primary Dependencies**: Express 4, `pdf-parse`, `@xenova/transformers` (local embedder), `crypto` (Node built-in), `fetch` (Node 20 built-in — no new runtime dependency)

**Storage**: `vector_store.json` flat JSON array on disk; in-memory cache via `vectorStore.js`

**Testing**: Manual `curl` smoke tests against live server; `node test-gold.js` for query pipeline regression

**Target Platform**: Node 20 server (Linux/Windows)

**Project Type**: web-service (Express REST API extension)

**Performance Goals**: Single-file synchronous ingest; SC-001 sets an informal 60-second wall-clock bound per file

**Constraints**: No external embedding calls (§5 Privacy Boundary); no stack traces in error responses; async-only I/O on request path; CORS unchanged

**Scale/Scope**: One file per call; no concurrency guarantees required for this feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| §1 Grounding-Only | ✅ N/A | Ingest path, not query path |
| §2 Citations-Mandatory | ✅ N/A | Ingest path, not query path |
| §3 Fail-Closed | ✅ N/A | Ingest path, not query path |
| §4 Exact-Figure Fidelity | ✅ N/A | Ingest path, not query path |
| §5 Privacy Boundary | ✅ PASS | Embeddings remain local; PDF chunks not sent to Anthropic |
| §6 No-Advice | ✅ N/A | Ingest path, not query path |
| Code Standards — No JSDoc | ✅ PASS | No JSDoc will be added |
| Code Standards — No banner comments | ✅ PASS | No banners will be added |
| Code Standards — Async I/O on request path | ✅ PASS | `fetch`, `pdf-parse`, `embed`, `vectorStore.append` all async |
| Code Standards — CORS unchanged | ✅ PASS | No CORS modifications |
| Code Standards — No stack traces in responses | ✅ PASS | FR-007 enforced in route handler |
| Code Standards — Input validated at boundary | ✅ PASS | Auth (FR-002) and body (FR-006) validated before processing |

**Post-Phase 1 re-check**: ✅ All gates still pass. No violations introduced by the design.

## Project Structure

### Documentation (this feature)

```text
specs/004-supabase-storage-ingest/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api-endpoints.md # Phase 1 output
├── checklists/
│   ├── requirements.md
│   └── api.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── server.js            # MODIFIED — mount POST /api/ingest router
├── vectorStore.js       # MODIFIED — add append() export
├── routes/
│   └── ingest.js        # NEW — auth check, validation, download, chunk, embed, append, respond
├── embedder.js          # UNCHANGED
├── ingest.js            # UNCHANGED (FR-008)
├── llm.js               # UNCHANGED
└── query.js             # UNCHANGED
```

**Structure Decision**: Single-project Express layout. The new route is isolated to `src/routes/ingest.js` (exporting an Express Router mounted in `server.js`) to keep `server.js` concise and the ingest pipeline independently reviewable. No test directory is introduced — the feature is validated via manual `curl` smoke tests and `test-gold.js` regression.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PDF download | `fetch` + `Buffer.from(arrayBuffer)` | Node 20 built-in; no new dependency (R-001) |
| Secret comparison | HMAC-SHA256 digest + `crypto.timingSafeEqual` | Prevents timing side-channels; handles variable-length strings (R-003) |
| Chunking logic | Inlined in `src/routes/ingest.js` | Avoids touching `ingest.js`; satisfies FR-008 (R-004) |
| Vector store mutation | New `append()` export in `vectorStore.js` | Preserves existing entries; `save()` for CLI unchanged (R-002) |
| URL encoding | `encodeURIComponent(bucket)`, `encodeURIComponent(filename)` | Handles spaces and special characters safely (R-005) |
| INGEST_SECRET absent | Return `false` → HTTP 401 | Fail-closed; unset env = no open write access (R-006) |
| Route placement | `src/routes/ingest.js` as Express Router | Isolates pipeline logic; keeps `server.js` concise (R-007) |
