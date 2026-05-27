# EOB Chatbot — Copilot Instructions

## Project Purpose

RAG-over-documents chatbot that answers patient questions about insurance Explanation of Benefits (EOB) documents. Patients ask plain-language questions; the system retrieves grounded excerpts and generates answers citing exact figures from source documents.

## Runtime Stack

- Node 20, Express 4 — REST API server (`src/server.js`)
- `@anthropic-ai/sdk` — Anthropic Claude for answer generation (`src/llm.js`)
- `@xenova/transformers` — local `Xenova/all-MiniLM-L6-v2` (quantized) embeddings, no external embedding API call (`src/embedder.js`)
- `pdf-parse` — optional PDF text extraction
- React 18, Vite 5 — chat UI (`client/`)
- `vector_store.json` — flat JSON array persisting chunk embeddings on disk

## NPM Scripts

- `npm run ingest` — one-shot CLI: reads `./data/*.{pdf,txt}`, chunks, embeds, writes `vector_store.json`
- `npm start` — starts Express on `PORT` (default 3001)
- `npm run dev:server` — `node --watch src/server.js`
- `npm run dev:client` — Vite dev server on port 5173, proxies `/api` to 3001
- `node test-gold.js` — 6 gold-row assertions against live server; exits 1 on any failure

## Module Architecture

- `src/server.js` — Express entry point; loads vector store at startup before `app.listen`; exposes `GET /api/health` and `POST /api/query`; serves React build as static fallback
- `src/query.js` — request pipeline: embed question → cosine search → keyword supplement → build context → call LLM → return `{ answer, citations }`
- `src/llm.js` — Anthropic Claude integration; calls `callLLM(systemPrompt, userMessage)` using the configured `ANTHROPIC_MODEL`
- `src/embedder.js` — wraps `@xenova/transformers` pipeline; caches model in `.xenova-cache/`; satisfies §5 Privacy Boundary (no external embedding call)
- `src/vectorStore.js` — in-memory cache of `vector_store.json`; exports `load()`, `save()`, `searchWithScores()`, `getAll()`, `storeSize()`; no synchronous fs calls on the request path
- `src/ingest.js` — one-shot admin CLI; reads data files, chunks at 300 chars / 50 overlap, embeds, writes store
- `client/src/App.jsx` — single-page React chat UI; citation block; refusal badge; suggested-question buttons

## Six Non-Negotiable Response Principles

- §1 Grounding-Only: answer only from retrieved document excerpts, never from outside knowledge
- §2 Citations-Mandatory: every answer ends with a Source line naming file and field
- §3 Fail-Closed: if no relevant chunk found, return exactly `"I can't find that in your documents."`
- §4 Exact-Figure Fidelity: monetary amounts, reference numbers, and dates returned verbatim
- §5 Privacy Boundary: local embeddings only; no personal health data sent to external services except Anthropic with anonymised excerpts
- §6 No-Advice: describe what documents say; never advise on payments, disputes, or medical decisions

## Code Standards

- No JSDoc blocks in any source file
- No section-banner comments (`// ── ... ──`)
- No standalone inline explanatory comments
- Async I/O only on the server request path (no `readFileSync`/`writeFileSync` in `vectorStore.js`)
- CORS restricted to explicit origins from `ALLOWED_ORIGINS` env var (default `http://localhost:5173`)
- Error responses never expose stack traces to HTTP clients
- Input validated at every API boundary

## SpecKit Context

Constitution: `.specify/memory/constitution.md`
Spec files: `specs/` (one subdirectory per feature)

<!-- SPECKIT START -->
Active plan: `specs/004-supabase-storage-ingest/plan.md`
<!-- SPECKIT END -->
