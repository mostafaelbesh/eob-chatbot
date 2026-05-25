# Research: Query API

## Decision 1 — Exposing cosine scores from `vectorStore.js`

**Problem**: The existing `vectorStore.search(queryEmbedding, topK)` returns entry objects but discards scores. The API response requires `citations[].score`.

**Decision**: Add `searchWithScores(queryEmbedding, topK, minScore)` to `vectorStore.js`. It mirrors the existing `search()` logic but: (a) filters entries whose cosine score is below `minScore` before slicing, and (b) returns `{ text, source, chunkIndex, score }` objects instead of raw entries.

**Rationale**: Minimal surgical extension to an existing module; avoids duplicating cosine logic outside `vectorStore.js`; the existing `search()` function is retained unchanged for backward compatibility with `ingest.js` if needed.

**Alternatives considered**:
- Export `cosine()` and re-implement scoring in `query.js` — rejected because it duplicates logic and spreads responsibility.
- Replace `search()` with the new signature — rejected because it is a breaking change to an already-shipped module.

---

## Decision 2 — Keyword supplement algorithm

**Problem**: Pure vector search can miss exact-match terminology (claim numbers, procedure codes). The spec requires supplementing with keyword matches: words of 4+ characters that appear 2+ times in a chunk's text.

**Decision**: In `query.js`, extract all lowercased words of 4+ characters from the question, then scan every chunk in the store. A chunk is a keyword hit if any of those question words appears 2 or more times (case-insensitive) in the chunk's `text`. Keyword hits are deduplicated against the vector results by `chunkIndex` or `source+text` equality. Keyword-matched chunks are assigned `score: 0` (no cosine score) in citations.

**Rationale**: Simple frequency count over raw text is fast, deterministic, and requires no additional dependencies. The 4-char minimum avoids noise from short articles ("the", "and"). The 2-hit threshold prevents single-mention coincidences from polluting context.

**Alternatives considered**:
- TF-IDF over the store — rejected as over-engineered for a handful of chunks.
- BM25 — rejected for the same reason and adds a dependency.
- Stemming/fuzzy matching — explicitly out of scope per spec Assumptions.

---

## Decision 3 — LLM system prompt structure

**Problem**: The system prompt must enforce §1–§6 without being so prescriptive that it degrades answer quality.

**Decision**: The system prompt has four parts:

1. **Role statement**: "You are an assistant that answers questions about insurance Explanation of Benefits (EOB) documents."
2. **Grounding rule (§1)**: "Answer using ONLY the document excerpts provided below. Do not use any outside knowledge."
3. **Fidelity rule (§4)**: "All monetary amounts, reference numbers, and dates must be reproduced exactly as they appear in the source text. Never round, abbreviate, or reformat figures."
4. **No-advice rule (§6)**: "Describe only what the documents say. Do not advise on payment strategies, dispute procedures, appeals, or medical decisions."
5. **Citation rule (§2)**: "End every answer with a line beginning 'Source:' that names the document filename and the specific field cited."
6. **Fail-closed instruction**: "If the provided excerpts do not contain enough information to answer, respond with exactly: I can't find that in your documents."

The user message concatenates retrieved excerpts (numbered, labeled with source filename) followed by the patient's question.

**Rationale**: All six principles are represented in the prompt. The excerpt header format (`[1] source: filename.txt`) gives the model the source name needed for the citation line.

**Alternatives considered**:
- Embedding rules in the user message — rejected because system prompts are more reliably followed and keep concerns separated.
- Using XML tags for context delimiting — considered but not needed for this volume of text.

---

## Decision 4 — CORS origin parsing

**Problem**: `ALLOWED_ORIGINS` may contain one or more origins. The `cors` package must never emit a wildcard.

**Decision**: Parse `ALLOWED_ORIGINS` by splitting on `,` and trimming whitespace. Pass a dynamic `origin` callback to the `cors()` middleware: calls `cb(null, true)` if the request `Origin` header is in the list (or absent — same-origin requests have no `Origin`), and `cb(new Error('Not allowed by CORS'))` otherwise. The default list is `['http://localhost:5173']`.

**Rationale**: Dynamic origin callback is the standard `cors` package pattern for allowlist enforcement. Splitting on comma supports multi-origin deployments without a separate env format.

**Alternatives considered**:
- `origin: origins` array directly — rejects requests with no `Origin` header (e.g., curl, server-to-server), which is too restrictive for development and health checks.
- Separate env vars per origin (`ALLOWED_ORIGIN_1`, etc.) — rejected as needlessly complex.

---

## Decision 5 — Fail-closed guard placement

**Problem**: §3 requires the LLM NOT to be called when no relevant chunks are found. The guard must be unambiguous.

**Decision**: After building the combined chunk list (vector hits + keyword hits), if the list is empty, `query.js` returns `{ answer: "I can't find that in your documents.", citations: [] }` immediately — before any call to `callLLM()`. This is a single early-return guard clause, not a conditional around the LLM call.

**Rationale**: An early return is the safest pattern; it is impossible to accidentally call the LLM if the guard fires. It also avoids any state that might need cleanup.

**Alternatives considered**:
- Calling the LLM with empty context and relying on the system prompt to refuse — explicitly rejected by §3, which requires zero LLM calls on this path.

---

## Decision 6 — `callLLM` interface and lazy client init

**Problem**: `@anthropic-ai/sdk` requires an API key at client construction time. The key is read from `.env`; the client should not be constructed at module load time to avoid crashes on missing key before the server is ready.

**Decision**: `llm.js` exports `callLLM(systemPrompt, userMessage)`. The `Anthropic` client instance is created on first call and cached in a module-level variable (`let client = null`). `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are read from `process.env` (populated by `dotenv` in `server.js` before any `require`). `callLLM` returns the text of `response.content[0].text`.

**Rationale**: Lazy init avoids construction-time failures if the env var is missing during testing or health checks. Module-level caching avoids creating a new client per request.

**Alternatives considered**:
- Constructing the client at the top of the module — rejected because it throws at `require` time if `ANTHROPIC_API_KEY` is absent.
- Passing the client as a parameter — rejected as over-engineered; there is only one LLM provider.

---

## Decision 7 — Vector store startup gate

**Problem**: FR-014 requires the vector store to be fully loaded before the server accepts connections.

**Decision**: In `server.js`, call `vectorStore.load()` with `await` before `app.listen(...)`. The `main()` async wrapper handles this sequencing. If `load()` throws, the process exits with a non-zero code (no `app.listen` is reached).

**Rationale**: `await` before `listen` is the simplest correct pattern. It requires zero additional synchronisation primitives.

**Alternatives considered**:
- Load the store inside the first request handler and cache it — rejected because it violates FR-014 and adds latency to the first request.
- Load in parallel with `listen` and gate requests via middleware — rejected as over-engineered; the load is fast (~100 ms for typical store sizes).
