# Data Model: Document Ingestion Pipeline

**Phase**: 1 | **Branch**: `001-ingestion-pipeline` | **Date**: 2026-05-25

---

## Entities

### VectorStoreEntry *(persisted — written to `vector_store.json`)*

Represents a single embedded chunk that has been written to the vector store and is available for retrieval at query time.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `text` | string | length ∈ [20, 300] | Raw chunk text, stored verbatim from the source document (§4 Exact-Figure Fidelity) |
| `source` | string | non-empty; filename only, no path | Basename of the originating file (e.g. `"eob-2024.pdf"`) |
| `chunkIndex` | integer | ≥ 0 | Zero-based position of this chunk within its source document |
| `embedding` | number[] | length = 384; all values ∈ ℝ | Float vector produced by `Xenova/all-MiniLM-L6-v2` quantized |

**Persistence**: Flat JSON array in `vector_store.json` at project root. Full overwrite on each ingest run.

**Example**:
```json
{
  "text": "Total Amount Billed: $1,245.00  Plan Paid: $996.00  Member Responsibility: $249.00",
  "source": "eob-2024-q1.txt",
  "chunkIndex": 3,
  "embedding": [0.0421, -0.1183, 0.0877, "...383 more values..."]
}
```

---

### DocumentChunk *(in-memory intermediate — never persisted)*

An intermediate unit of text produced by the chunking step, held in memory until its embedding is computed.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `text` | string | length ≥ 20 | Chunk text after sliding-window slice and minimum-length filter |
| `source` | string | non-empty; filename only | Basename of the originating file |
| `chunkIndex` | integer | ≥ 0 | Zero-based position of this chunk within its source document |

**Lifecycle**: Created by the chunking loop in `ingest.js`. Consumed immediately by the embedding loop. Discarded after the `VectorStoreEntry` is appended to the output array. Not exposed outside `ingest.js`.

---

## State Transitions

```
Source file (.pdf / .txt)
  │
  ▼ text extraction
raw text string
  │
  ▼ sliding-window chunking (CHUNK_SIZE=300, CHUNK_OVERLAP=50, step=250)
  │   filter: length < 20 → discard
  ▼
DocumentChunk[]          ← in-memory array (all chunks from all files)
  │
  ▼ embed(chunk.text)    ← Xenova/all-MiniLM-L6-v2 local model, no external call
VectorStoreEntry[]       ← embedding appended, progress counter updated
  │
  ▼ JSON.stringify
vector_store.json        ← flat array, full overwrite
```

---

## Validation Rules

| Rule | Enforcement point |
|---|---|
| `text.length >= 20` | Chunking loop in `ingest.js` (FR-005) |
| `source` is basename only (no directory path) | `path.basename()` call in `ingest.js` |
| `chunkIndex` is a non-negative integer | Loop index variable, starts at 0, increments by 1 |
| `embedding` is a non-empty numeric array | Enforced by the embedding model output |
| At least one entry produced | Exit-code-1 guard at end of `ingest.js` (FR-011) |

---

## Embedding Dimensions

`Xenova/all-MiniLM-L6-v2` produces 384-dimensional embeddings. This is a fixed contract: the model version must not be changed without re-running `npm run ingest` to regenerate all embeddings, since cosine similarity comparisons require all vectors to have the same dimensionality.
