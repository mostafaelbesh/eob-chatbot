# Feature Specification: Document Ingestion Pipeline

**Feature Branch**: `001-ingestion-pipeline`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "One-shot CLI script (npm run ingest) that reads .pdf and .txt files from ./data/, extracts text using pdf-parse for PDFs and fs.readFileSync for .txt files, chunks text at 300 characters with 50-character overlap skipping chunks shorter than 20 characters, embeds each chunk using the local Xenova/all-MiniLM-L6-v2 quantized model via @xenova/transformers with no external API call, and writes all entries to vector_store.json as a flat JSON array. Each entry must have fields: text, source, chunkIndex, embedding. Script must show a progress counter during embedding using process.stdout.write overwriting the same line. Must gracefully handle absent pdf-parse: warn with console.warn and skip PDFs, still process .txt files. Exits code 0 on success, code 1 if no eligible files found."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingest EOB Documents into Vector Store (Priority: P1)

An operator places one or more EOB documents (.pdf or .txt) into the `./data/` folder and runs `npm run ingest`. The script reads all eligible files, extracts their text, splits them into overlapping chunks, computes a local embedding for each chunk, and writes the complete set of entries to `vector_store.json`. Once complete, the chatbot can answer questions grounded in those documents.

**Why this priority**: This is the foundation of the entire RAG pipeline. Without a populated vector store, the chatbot cannot answer any patient queries.

**Independent Test**: Place one .txt file in `./data/`, run `npm run ingest`, verify `vector_store.json` is created with entries containing `text`, `source`, `chunkIndex`, and `embedding` fields.

**Acceptance Scenarios**:

1. **Given** one or more .pdf and .txt files exist in `./data/`, **When** `npm run ingest` is run, **Then** `vector_store.json` is written containing a flat JSON array where every entry has `text`, `source`, `chunkIndex`, and `embedding` fields.
2. **Given** a 300-character chunk boundary exists within a document, **When** chunking runs, **Then** consecutive chunks overlap by 50 characters and no chunk shorter than 20 characters is included in the output.
3. **Given** the script completes successfully, **When** the process exits, **Then** the exit code is `0`.

---

### User Story 2 - Monitor Embedding Progress (Priority: P2)

An operator running the script on a large document set needs real-time feedback so they can see that the process is making progress and estimate when it will finish without scrolling through noise.

**Why this priority**: Embedding is the slowest step; without feedback the operator cannot distinguish a working run from a hung process.

**Independent Test**: Run `npm run ingest` with multiple files, observe that the terminal line is overwritten in place with a counter (e.g., `Embedding chunk 12 / 45`) as each chunk is processed.

**Acceptance Scenarios**:

1. **Given** the embedding loop is processing chunks, **When** each chunk embedding completes, **Then** a counter showing current chunk index and total chunk count is written to the same terminal line (overwriting the previous counter).
2. **Given** all chunks have been embedded, **When** the embedding loop finishes, **Then** a final newline is emitted so the next log message appears on a fresh line.

---

### User Story 3 - Graceful Degradation Without PDF Support (Priority: P3)

An operator runs `npm run ingest` in an environment where the `pdf-parse` package is not installed. The script must not crash; it should warn the operator and skip PDF files while still processing all .txt files.

**Why this priority**: Operators on restricted environments or lightweight containers may lack optional native dependencies; the .txt fallback must remain fully functional.

**Independent Test**: Temporarily rename or remove `pdf-parse` from the environment, place both a .pdf and a .txt file in `./data/`, run `npm run ingest`, verify .txt file is processed and a `console.warn` message about the missing PDF support appears.

**Acceptance Scenarios**:

1. **Given** `pdf-parse` is not installed and .pdf files are present in `./data/`, **When** `npm run ingest` is run, **Then** a warning is emitted via `console.warn` for each skipped PDF and the script continues without throwing.
2. **Given** `pdf-parse` is not installed but .txt files are present, **When** `npm run ingest` runs, **Then** .txt files are fully processed and `vector_store.json` is written successfully.

---

### User Story 4 - No Eligible Files Found (Priority: P3)

An operator runs `npm run ingest` when `./data/` is empty or contains no .pdf or .txt files (and/or pdf-parse is absent making all files ineligible).

**Why this priority**: A clear failure signal prevents silent data-loss scenarios where the chatbot appears to work but has an empty knowledge base.

**Independent Test**: Run `npm run ingest` with an empty `./data/` folder; verify the exit code is `1` and an informative message is emitted.

**Acceptance Scenarios**:

1. **Given** `./data/` contains no .pdf or .txt files, **When** `npm run ingest` is run, **Then** the process exits with code `1` and reports that no eligible files were found.
2. **Given** `./data/` contains only .pdf files and `pdf-parse` is absent, **When** `npm run ingest` is run, **Then** after warning about skipped PDFs the process exits with code `1` (no eligible files remain).

---

### Edge Cases

- What happens when a document produces zero chunks after filtering (all chunks < 20 characters)?
- How does the script behave when `./data/` directory does not exist?
- What happens if a .txt file is empty?
- How does the script handle a PDF that `pdf-parse` successfully loads but extracts no text?
- What happens to an existing `vector_store.json`—is it overwritten or appended?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The script MUST scan `./data/` for all files with `.pdf` and `.txt` extensions (case-insensitive).
- **FR-002**: The script MUST extract text from `.txt` files using synchronous filesystem reading.
- **FR-003**: The script MUST extract text from `.pdf` files using `pdf-parse`; if `pdf-parse` is unavailable, it MUST emit a `console.warn` message per skipped file and skip those files without crashing.
- **FR-004**: The script MUST split extracted text into chunks of 300 characters with a 50-character overlap between consecutive chunks.
- **FR-005**: The script MUST discard any chunk whose character length is less than 20.
- **FR-006**: The script MUST embed each chunk locally using the `Xenova/all-MiniLM-L6-v2` quantized model; no chunk text or embedding request MUST be sent to any external API.
- **FR-007**: Each vector store entry MUST contain exactly the fields: `text` (string), `source` (filename string), `chunkIndex` (integer), `embedding` (numeric array).
- **FR-008**: The script MUST write all entries as a flat JSON array to `vector_store.json`, overwriting any existing file.
- **FR-009**: During the embedding phase the script MUST display a live progress counter on a single overwritten terminal line showing the current chunk number and total chunk count.
- **FR-010**: The script MUST exit with code `0` when at least one chunk has been successfully embedded and written.
- **FR-011**: The script MUST exit with code `1` when no eligible files produce any chunks (empty data directory, all files skipped, or all chunks filtered out).

### Key Entities

- **VectorStoreEntry**: Represents a single embedded chunk persisted to disk. Attributes: `text` (chunk content), `source` (originating filename), `chunkIndex` (zero-based position of chunk within its source document), `embedding` (fixed-length float array produced by the local embedding model).
- **DocumentChunk**: An intermediate in-memory unit of text derived from a source document after chunking and length filtering, before embedding is computed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `npm run ingest` against a directory of mixed .pdf and .txt files completes without error and produces a `vector_store.json` file in under 5 minutes for a total input size of up to 10 MB.
- **SC-002**: Every entry in the output `vector_store.json` passes schema validation: `text` is a non-empty string, `source` is a non-empty string, `chunkIndex` is a non-negative integer, `embedding` is a non-empty numeric array.
- **SC-003**: No network requests to any external service are made during a full ingest run (verifiable by running the script with network disabled).
- **SC-004**: When `pdf-parse` is absent, 100% of .txt files are still processed and the script exits with code `0` (provided .txt files exist).
- **SC-005**: The terminal progress counter updates for every chunk and does not produce more than one new line during the embedding loop.

## Assumptions

- The `./data/` directory exists relative to the working directory where the script is run; the script is always invoked from the project root.
- File extension matching is case-insensitive (`.PDF` is treated the same as `.pdf`).
- `pdf-parse` and `@xenova/transformers` are listed as project dependencies; `pdf-parse` is treated as optional at runtime.
- The embedding model cache directory is `.xenova-cache/` relative to the project root and will be created automatically by the transformer library on first run.
- Writing `vector_store.json` is a full overwrite each run; incremental updates are out of scope.
- The script is a one-shot batch operation, not a daemon or watcher; it exits when done.
- `.pdf` and `.txt` are the only supported file types; other extensions in `./data/` are silently ignored.
