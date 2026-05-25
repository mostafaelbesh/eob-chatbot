# Module Interface Contracts: Document Ingestion Pipeline

**Phase**: 1 | **Branch**: `001-ingestion-pipeline` | **Date**: 2026-05-25

These contracts define the public export surface of each module. Implementations MUST satisfy these signatures exactly. All paths are relative to the project root.

---

## `src/embedder.js`

### `embed(text)`

```
embed(text: string): Promise<number[]>
```

Computes and returns the embedding vector for `text` using the `Xenova/all-MiniLM-L6-v2` quantized model running locally. Initialises the pipeline singleton on first call; subsequent calls reuse the cached instance.

**Parameters**:
- `text` — the string to embed; caller guarantees non-empty (minimum 20 characters, enforced upstream)

**Returns**: `Promise` that resolves to a plain `Array` of 384 floats (mean-pooled output of the model)

**Side effects**:
- On first call: downloads and caches model weights to `.xenova-cache/` (relative to `process.cwd()`); subsequent calls use cached weights
- No network calls are made to any external service (§5 Privacy Boundary)

**Throws**: Propagates any error from the underlying `@xenova/transformers` pipeline (e.g. model not found, cache write failure)

**Not exported**: any pipeline instance, any model state, `env`

---

## `src/vectorStore.js`

### `load()`

```
load(): Promise<void>
```

Reads `vector_store.json` from the project root and populates the in-memory store. If the file does not exist, the store is initialised as an empty array (no error thrown).

**Side effects**: Replaces the in-memory store with the parsed JSON array

**Throws**: `SyntaxError` if the file exists but contains invalid JSON

---

### `save(entries)`

```
save(entries: VectorStoreEntry[]): Promise<void>
```

Serialises `entries` to compact JSON and writes to `vector_store.json` at the project root, overwriting any existing file.

**Parameters**:
- `entries` — the complete array of `VectorStoreEntry` objects to persist

**Side effects**: Replaces `vector_store.json` on disk; does NOT update the in-memory store

**Throws**: Any `fs.promises.writeFile` error (e.g. permission denied)

---

### `search(queryEmbedding, topK)`

```
search(queryEmbedding: number[], topK: number): VectorStoreEntry[]
```

Ranks all in-memory entries by cosine similarity to `queryEmbedding` and returns the top-`topK` results in descending score order. Operates entirely in memory — no I/O.

**Parameters**:
- `queryEmbedding` — a 384-element float array (same dimensionality as stored embeddings)
- `topK` — maximum number of results to return; if the store has fewer entries than `topK`, all entries are returned

**Returns**: Array of `VectorStoreEntry` objects, length ≤ `topK`, sorted by descending cosine similarity

**Precondition**: `load()` must have been called before `search()`. If the store is empty, returns `[]`.

**Note**: This function is synchronous (no `async`). Callers MUST NOT `await` it.

---

### `storeSize()`

```
storeSize(): number
```

Returns the number of entries currently in the in-memory store.

**Returns**: Non-negative integer

**Note**: This function is synchronous. Callers MUST NOT `await` it.

---

## `src/ingest.js` — CLI contract (not a Node module)

`ingest.js` is an executable script, not a library. It exports nothing. It is invoked via:

```
node src/ingest.js
```

or

```
npm run ingest
```

**Exit codes**:

| Code | Meaning |
|---|---|
| `0` | At least one chunk was embedded and `vector_store.json` was written successfully |
| `1` | No eligible files produced any chunks (empty `./data/`, all PDFs skipped, all chunks < 20 chars) |

**Standard output**: Progress counter line (overwritten in place) during embedding; summary line on completion.

**Standard error / warnings**: `console.warn` messages for each `.pdf` file skipped due to missing `pdf-parse`.

---

## `vector_store.json` — Output Schema

Flat JSON array of `VectorStoreEntry` objects at the project root.

```json
[
  {
    "text": "string (20–300 chars)",
    "source": "string (filename, no path)",
    "chunkIndex": 0,
    "embedding": [0.042, -0.118, "...384 total floats..."]
  }
]
```

An empty store is represented as `[]` (empty array), not `null` or absent.
