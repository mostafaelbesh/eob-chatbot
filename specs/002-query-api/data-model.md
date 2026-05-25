# Data Model: Query API

## Entities

### Chunk *(persisted in `vector_store.json`, owned by feature 001)*

Represents a fixed-size text segment extracted from a source document during ingestion.

| Field | Type | Constraints |
|---|---|---|
| `text` | string | Non-empty; max 300 characters; verbatim from source document |
| `source` | string | Basename of the originating file (e.g., `eob-2024.txt`) |
| `chunkIndex` | number | Zero-based position within the source file; integer ≥ 0 |
| `embedding` | number[] | 384-dimensional unit vector (Xenova/all-MiniLM-L6-v2 output) |

**Validation rules**: `text` must not be empty. `embedding` length must equal 384. `source` must not be empty.

**Storage**: Persisted as a flat JSON array in `vector_store.json` at the project root. Loaded once at startup into a module-level array in `vectorStore.js`; never mutated on the request path.

---

### ScoredChunk *(transient, produced by `searchWithScores()`)*

Represents a chunk retrieved from the store together with its relevance score. Used internally by `query.js` before being projected into Citation objects.

| Field | Type | Constraints |
|---|---|---|
| `text` | string | Verbatim chunk text; never modified |
| `source` | string | Filename from the originating Chunk |
| `chunkIndex` | number | Index from the originating Chunk |
| `score` | number | Cosine similarity in [0, 1]; vector hits have score > 0.10; keyword-only hits use score 0 |

---

### QueryRequest *(inbound API payload)*

The sole input to the query pipeline; validated at the API boundary in `server.js`.

| Field | Type | Constraints |
|---|---|---|
| `question` | string | Required; non-empty after trimming; must be a string (not null, number, array, or object) |

**Validation rules** (FR-002):
- Missing `question` → HTTP 400
- `question` is not a string → HTTP 400
- `question` is an empty string or whitespace-only → HTTP 400

---

### Citation *(outbound, element of `QueryResponse.citations`)*

A projection of a ScoredChunk for the API caller. Contains only the data needed for source attribution.

| Field | Type | Constraints |
|---|---|---|
| `source` | string | Filename of the originating document |
| `excerpt` | string | Verbatim chunk text; never modified or summarised |
| `score` | number | Cosine similarity; 0 for keyword-only hits |

---

### QueryResponse *(outbound API payload for `POST /api/query`)*

Returned for every valid request regardless of whether relevant content was found.

| Field | Type | Constraints |
|---|---|---|
| `answer` | string | LLM-generated text ending with a `Source:` line; or exactly `"I can't find that in your documents."` |
| `citations` | Citation[] | Empty array when fail-closed; otherwise 1–6 elements |

**Invariants**:
- `citations` is always present (never `undefined` or `null`).
- When `answer` is `"I can't find that in your documents."`, `citations` is `[]`.
- When `answer` is LLM-generated, `citations` is non-empty.

---

### HealthResponse *(outbound API payload for `GET /api/health`)*

| Field | Type | Constraints |
|---|---|---|
| `status` | string | Always `"ok"` |
| `provider` | string | Always `"anthropic"` |
| `model` | string | Value of `ANTHROPIC_MODEL` env var (default `"claude-sonnet-4-6"`) |
| `storeReady` | boolean | `true` when `vectorStore.storeSize() > 0`; `false` otherwise |
| `timestamp` | string | ISO 8601 UTC datetime string at time of response |

---

## Module Responsibilities

| Module | Entities produced | Entities consumed |
|---|---|---|
| `vectorStore.js` | ScoredChunk (via `searchWithScores`) | Chunk (from `vector_store.json`) |
| `embedder.js` | number[] (query embedding) | — |
| `query.js` | QueryResponse, Citation | QueryRequest (validated), ScoredChunk |
| `llm.js` | string (answer text) | string (system prompt + user message) |
| `server.js` | HTTP responses | QueryRequest, QueryResponse, HealthResponse |

---

## State Transitions

```text
Startup
  └─► vectorStore.load() ──► store populated ──► app.listen() ──► READY

POST /api/query
  ├─► [invalid input]     ──► HTTP 400 (no state change)
  ├─► [no chunks found]   ──► HTTP 200  { answer: "I can't find...", citations: [] }
  └─► [chunks found]      ──► LLM call ──► HTTP 200 { answer, citations }
```

The in-memory store is **read-only** on the request path. No writes occur after startup.
