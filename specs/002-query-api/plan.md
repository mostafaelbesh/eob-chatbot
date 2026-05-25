# Implementation Plan: Query API

**Branch**: `002-query-api` | **Date**: 2026-05-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-query-api/spec.md`

## Summary

Express 4 REST API with two endpoints — `POST /api/query` and `GET /api/health` — forming the complete RAG query pipeline: locally embed the incoming question (`Xenova/all-MiniLM-L6-v2`), cosine-search the in-memory vector store (top-6, `MIN_SCORE=0.10`), supplement with keyword matches, generate a grounded answer via Anthropic `claude-sonnet-4-6`, and return `{ answer, citations }`. CORS is restricted to `ALLOWED_ORIGINS`; the vector store is loaded once at startup before `app.listen`. Three new source files are created: `src/server.js`, `src/query.js`, `src/llm.js`. `src/vectorStore.js` gains a `searchWithScores()` export. `test-gold.js` at project root provides 6 gold-row assertions.

## Technical Context

**Language/Version**: Node 20, CommonJS (`require` / `module.exports`)

**Primary Dependencies**: Express `^4.19.2`, `@anthropic-ai/sdk ^0.26.0`, `cors ^2.8.5`, `dotenv ^16.4.5`; reuses `@xenova/transformers` from feature 001

**Storage**: `vector_store.json` flat JSON array; loaded into memory at startup via `vectorStore.load()`, then accessed synchronously via `searchWithScores()` on every request path

**Testing**: `node test-gold.js` — 6 gold-row assertions against a live server on PORT 3001; exits 1 on any failure

**Target Platform**: Node 20 server process; local development and cloud-hosted Linux environments

**Project Type**: Web service REST API

**Performance Goals**: <5 s p95 response time for `POST /api/query` (SC-001); <100 ms for `GET /api/health` (SC-007)

**Constraints**: `MIN_SCORE=0.10` threshold; top-6 vector hits; no external embedding API (§5 Privacy Boundary); no LLM call on fail-closed path (§3); no stack traces in HTTP error responses; no wildcard CORS

**Scale/Scope**: Single-instance, single-user MVP; vector store up to ~10 MB in memory

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — all gates still pass.*

| Principle | Status | Notes |
|---|---|---|
| §1 Grounding-Only | PASS | `query.js` passes only retrieved chunk texts as LLM context; system prompt explicitly prohibits use of outside knowledge |
| §2 Citations-Mandatory | PASS | Every LLM answer ends with a `Source:` line; `citations` array always present in API response, even when empty |
| §3 Fail-Closed | PASS | Zero-match path returns fixed refusal string and exits before LLM invocation; enforced as a guard clause in `query.js` |
| §4 Exact-Figure Fidelity | PASS | System prompt instructs verbatim reproduction of amounts, reference numbers, and dates; no transformation applied to retrieved text |
| §5 Privacy Boundary | PASS | `embed()` from `embedder.js` uses local Xenova model; only chunk text sent to Anthropic, never raw embeddings or member identifiers |
| §6 No-Advice | PASS | System prompt explicitly prohibits advice on payments, disputes, appeals, or medical decisions |
| Code — No JSDoc | PASS | Enforced across all new source files |
| Code — No section banners | PASS | Enforced across all new source files |
| Code — Async I/O on request path | PASS | `vectorStore.load()` is async (startup only); `searchWithScores()` is synchronous in-memory; no `fs` I/O on the hot path |
| CORS | PASS | Origins parsed from `ALLOWED_ORIGINS` env var; dynamic origin callback; wildcard never emitted |
| Error response safety | PASS | `catch` blocks forward only a sanitised message string; no `err.stack` forwarded to client |
| Input validation | PASS | `question` type and non-empty check at API boundary before any processing in `server.js` |

*All gates PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/002-query-api/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api-endpoints.md # Phase 1 output
└── tasks.md             # Phase 2 output (not created here — /speckit.tasks)
```

### Source Code

```text
src/
├── server.js       # NEW  — Express entry: load env, load store, CORS, routes, static fallback
├── query.js        # NEW  — RAG pipeline: embed → cosine search → keyword supplement → LLM → response
├── llm.js          # NEW  — Anthropic wrapper: callLLM(systemPrompt, userMessage), lazy init
├── embedder.js     # UNCHANGED from feature 001
└── vectorStore.js  # EXTENDED — add searchWithScores(queryEmbedding, topK, minScore)

test-gold.js        # NEW — 6 gold-row assertions at project root
```
