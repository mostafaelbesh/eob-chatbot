# Research: Document Ingestion Pipeline

**Phase**: 0 | **Branch**: `001-ingestion-pipeline` | **Date**: 2026-05-25

All NEEDS CLARIFICATION items resolved. No open unknowns.

---

## Decision 1: Sliding-window chunking algorithm

**Decision**: Iterate index `i = 0, 1, 2, …` with `start = i * (CHUNK_SIZE - CHUNK_OVERLAP)` and `end = start + CHUNK_SIZE`. Stop when `start >= text.length`. Call `text.slice(start, end)` and discard the result if `chunk.length < MIN_CHUNK_LENGTH`.

Constants: `CHUNK_SIZE = 300`, `CHUNK_OVERLAP = 50`, `MIN_CHUNK_LENGTH = 20`, effective step `= 250`.

**Rationale**: Character-exact sliding window with no dependencies, O(n) time, O(n/step) memory. Fully deterministic and reproducible.

**Alternatives considered**:
- `langchain` `RecursiveCharacterTextSplitter` — rejected; heavy dependency, unpredictable boundary locations.
- Sentence-boundary splitting — rejected; spec mandates character counts, not linguistic units.

---

## Decision 2: Optional `pdf-parse` detection at runtime

**Decision**: At the top of `ingest.js`, detect availability with a try/catch around a synchronous `require`:
```
let pdfParse;
try { pdfParse = require('pdf-parse'); } catch (_) {}
```
Per-file: when `pdfParse` is `undefined` and the file extension is `.pdf`, emit `console.warn` for that file and skip it. `.txt` processing is independent of this code path.

**Rationale**: Idiomatic Node.js optional dependency pattern. No `package.json` changes needed. Zero cost when `pdf-parse` is present.

**Alternatives considered**:
- Checking `node_modules` with `fs.existsSync` — rejected; fragile across monorepos and nested installs.
- Dynamic `import()` — rejected; project is CommonJS (`require`/`module.exports`).

---

## Decision 3: Embedding model initialization and cache

**Decision**: In `embedder.js`:
1. Set `env.cacheDir = path.resolve(process.cwd(), '.xenova-cache')` at module load time (safe because `env` is synchronous config, not I/O).
2. Lazy-initialize the `pipeline` singleton on the first `embed()` call; subsequent calls reuse the cached instance.
3. Call `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true })`.
4. Extract the mean-pooled embedding from the model output and return a plain `Array` of floats.

**Rationale**: `env.cacheDir` is the documented `@xenova/transformers` v2 API for custom cache paths (verified: `typeof env.cacheDir === 'string'`). Lazy init avoids loading the model during unit inspection of other modules.

**Alternatives considered**:
- `TRANSFORMERS_CACHE` env var — rejected; requires callers to set the env var before the process starts.
- Eager init at module load — rejected; delays startup for any code that imports the module without calling `embed`.

---

## Decision 4: `vectorStore.js` — async-only fs contract

**Decision**: All four exports use `async/await` with `fs.promises`. Module-level state is a plain in-memory array (`let store = []`). No sync fs calls anywhere in the file.

```
load()        → fs.promises.readFile  → JSON.parse  → store
save(entries) → JSON.stringify        → fs.promises.writeFile
search(vec, k)→ cosine sort on store  → top-k slice (synchronous, in-memory)
storeSize()   → store.length          (synchronous, in-memory)
```

`search()` and `storeSize()` operate on the already-loaded in-memory cache and are intentionally synchronous (no I/O). They are not `async` and do not need to be awaited.

**Rationale**: Constitution Code Standards: `readFileSync`/`writeFileSync` are forbidden in `vectorStore.js`. `search()` and `storeSize()` are pure in-memory operations — making them `async` would add unnecessary `.then()` complexity on the call site.

**Alternatives considered**:
- `readFileSync` with a wrapper promise — rejected; the spec and constitution forbid sync fs in this module.
- Streaming JSON parse — rejected; `vector_store.json` is a bounded file (≤ 10 MB); full-parse is safe.

---

## Decision 5: Terminal progress counter

**Decision**: Before the embedding loop write `process.stdout.write('\r')`. On each completed chunk:
```
process.stdout.write(`\rEmbedding chunk ${done} / ${total}  `);
```
After the loop: `process.stdout.write('\n')`.

The trailing spaces pad the line to ensure any leftover shorter text from a previous write is overwritten.

**Rationale**: `\r` (carriage return without newline) moves the cursor to column 0 without advancing the line. Supported in Windows PowerShell, cmd, and all Unix terminals.

**Alternatives considered**:
- `readline.clearLine` + `readline.cursorTo` — correct but heavier; `\r` is sufficient and universally portable.
- `cli-progress` package — rejected; unnecessary dependency for a simple counter.
- ANSI `\033[2K\r` — more robust but adds complexity; `\r` with padding is sufficient.

---

## Decision 6: `vector_store.json` write semantics

**Decision**: `save(entries)` serialises the complete array with `JSON.stringify(entries)` (compact, no pretty-print to reduce file size) and atomically overwrites `vector_store.json` via `fs.promises.writeFile`.

**Rationale**: Spec assumption: "Writing `vector_store.json` is a full overwrite each run; incremental updates are out of scope." Compact JSON is faster to write and parse for large stores.

**Alternatives considered**:
- Pretty-printed JSON (`null, 2`) — rejected for production output; increases file size ~3×.
- Append mode — rejected; spec explicitly excludes incremental updates.

---

## Decision 7: Extension case-insensitivity

**Decision**: Normalise file extensions with `.toLowerCase()` before comparing to `'.pdf'` and `'.txt'`.

**Rationale**: Spec assumption: "File extension matching is case-insensitive."

---

## Open Questions

None. All clarifications resolved above.
