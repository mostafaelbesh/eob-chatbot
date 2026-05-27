# Feature Specification: Supabase Storage Ingest

**Feature Branch**: `004-supabase-storage-ingest`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Replace local ./data/ PDF ingestion with Supabase Storage as the document source. An n8n automation workflow uploads PDFs to a Supabase Storage bucket (eob-chatbot-bucket). After each successful upload, n8n calls this server to trigger ingestion. The server downloads the PDF from Supabase, runs the existing chunk-embed-save pipeline, and responds synchronously with the result."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Automation Triggers Ingestion After Upload (Priority: P1)

An n8n workflow uploads a new EOB PDF to the Supabase Storage bucket. Immediately after, it calls the ingest endpoint with the filename and bucket name. The server downloads the file, processes it through the existing pipeline, appends the resulting chunks to the vector store, and returns a success summary so n8n can log the outcome.

**Why this priority**: This is the core integration flow. Without it, newly uploaded documents never enter the vector store and patients receive stale or incomplete answers.

**Independent Test**: Can be fully tested by sending `POST /api/ingest` with a valid secret header, a known filename, and a valid bucket name, then verifying the response contains `chunksAdded` and `files`, and confirming the vector store grows by the expected number of chunks.

**Acceptance Scenarios**:

1. **Given** a PDF exists in the named Supabase Storage bucket, **When** a POST to `/api/ingest` is sent with `{ filename, bucket }` and a valid `x-ingest-secret` header, **Then** the response is HTTP 200 with `{ chunksAdded: <number>, files: [<filename>] }`.
2. **Given** a successful ingest response, **When** the vector store is inspected, **Then** it contains the newly added chunks attributed to the ingested filename.
3. **Given** a successful ingest response, **When** `chunksAdded` is inspected, **Then** it is a non-negative integer reflecting the number of new chunks appended.

---

### User Story 2 — Unauthorized Requests Are Rejected (Priority: P1)

Any caller without the correct shared secret is turned away before any document download or processing occurs.

**Why this priority**: The ingest endpoint modifies shared state (the vector store). Unauthorized modifications could corrupt results for all patients.

**Independent Test**: Can be fully tested by sending `POST /api/ingest` without the header, with a wrong value, and with an empty value, and verifying HTTP 401 is returned in all cases with no ingestion side-effect.

**Acceptance Scenarios**:

1. **Given** a well-formed request body, **When** the `x-ingest-secret` header is absent, **Then** the response is HTTP 401 and no download or vector store modification occurs.
2. **Given** a well-formed request body, **When** the `x-ingest-secret` header value does not match the server-configured secret, **Then** the response is HTTP 401.
3. **Given** a request with a valid secret, **When** the request is otherwise valid, **Then** the response is not HTTP 401.

---

### User Story 3 — Malformed Requests Are Rejected with a Clear Error (Priority: P1)

A caller sends a request with a missing or invalid body. The server rejects it immediately with a descriptive 400 response, exposing no internal details.

**Why this priority**: API contract correctness and security — invalid input is rejected at the boundary before any external calls are made.

**Independent Test**: Can be fully tested by sending requests with various bad bodies and confirming each returns HTTP 400 with a safe `{ error: string }` body.

**Acceptance Scenarios**:

1. **Given** a POST to `/api/ingest` with a valid secret, **When** `filename` is absent, **Then** the response is HTTP 400 with `{ error: <non-empty string> }`.
2. **Given** a POST to `/api/ingest` with a valid secret, **When** `bucket` is absent, **Then** the response is HTTP 400 with `{ error: <non-empty string> }`.
3. **Given** a POST to `/api/ingest` with a valid secret, **When** `filename` is an empty string, **Then** the response is HTTP 400.
4. **Given** a POST to `/api/ingest` with a valid secret, **When** `bucket` is an empty string, **Then** the response is HTTP 400.
5. **Given** any 400 response, **When** the body is inspected, **Then** it contains no stack trace or internal file paths.

---

### User Story 4 — Download or Processing Failure Returns a Safe Error (Priority: P2)

A file cannot be downloaded (file not found, network error) or the processing pipeline fails. The caller receives a generic 500 response without any system internals leaking.

**Why this priority**: Resilience and security — callers must be informed of failure without exposing server internals; n8n can retry or alert on a non-200.

**Independent Test**: Can be fully tested by sending a request referencing a non-existent file and verifying HTTP 500 with `{ error: "Ingestion failed" }` is returned.

**Acceptance Scenarios**:

1. **Given** a filename that does not exist in the bucket, **When** a valid ingest request is sent, **Then** the response is HTTP 500 with `{ "error": "Ingestion failed" }`.
2. **Given** any 500 response from this endpoint, **When** the body is inspected, **Then** it contains exactly `{ "error": "Ingestion failed" }` — no stack trace, no file paths, no internal details.

---

### User Story 5 — Local CLI Ingestion Continues to Work (Priority: P2)

An operator runs `npm run ingest` to re-index PDFs from the local `./data/` directory. This workflow is unaffected by the new endpoint.

**Why this priority**: Operational continuity — the CLI is the fallback for local development and disaster recovery; breaking it would block the entire ingest pipeline.

**Independent Test**: Can be fully tested by running `npm run ingest` with PDFs in `./data/` and confirming the vector store is populated exactly as before.

**Acceptance Scenarios**:

1. **Given** one or more PDFs exist in `./data/`, **When** `npm run ingest` is executed, **Then** the vector store is populated with chunks from those files.
2. **Given** the ingest CLI completes, **When** the vector store is queried, **Then** results from the locally ingested files are returned.

---

### Edge Cases

- What happens when the Supabase bucket name in the request differs from the configured bucket used by n8n (e.g., a typo)? The download attempt uses the caller-supplied bucket; if the file is not found there, the endpoint returns HTTP 500.
- What happens if the same filename is ingested twice? Chunks are appended again; deduplication is out of scope for this feature.
- What happens if `INGEST_SECRET` is not set in the environment? The server should treat any presented secret as non-matching (fail-closed), returning 401 for all ingest requests.
- What happens if `SUPABASE_URL` is not set? The download step fails and the endpoint returns HTTP 500.
- What happens with a PDF that yields zero extractable text? The pipeline produces zero chunks; the response is HTTP 200 with `{ chunksAdded: 0, files: [filename] }`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a `POST /api/ingest` endpoint that accepts a JSON body containing `filename` (string) and `bucket` (string).
- **FR-002**: System MUST authenticate every request to `POST /api/ingest` by comparing the `x-ingest-secret` header to the `INGEST_SECRET` environment variable; requests with a missing, empty, or mismatched header MUST be rejected with HTTP 401.
- **FR-003**: System MUST construct the file download URL from the `SUPABASE_URL` environment variable and the caller-supplied `bucket` and `filename`; no authentication header is required for the download because the bucket is public.
- **FR-004**: System MUST process the downloaded file through the same chunking (300 characters, 50-character overlap), embedding, and vector store append pipeline used by the existing ingest CLI.
- **FR-005**: On successful processing, system MUST respond synchronously with HTTP 200 and a JSON body `{ chunksAdded: number, files: string[] }`.
- **FR-006**: System MUST return HTTP 400 with `{ error: string }` when `filename` or `bucket` is absent or not a non-empty string.
- **FR-007**: System MUST return HTTP 500 with `{ "error": "Ingestion failed" }` and no stack trace when the download or any processing step fails.
- **FR-008**: The existing `npm run ingest` CLI MUST continue to operate unchanged, reading from `./data/` and writing to `vector_store.json`.

### Key Entities

- **Ingest Request**: A caller-supplied payload identifying a single file (`filename`) within a named Supabase Storage bucket (`bucket`).
- **Ingest Result**: A server-produced summary of the completed operation containing `chunksAdded` (integer) and `files` (array of filename strings).
- **Document Chunk**: A text segment (≤ 300 characters with 50-character overlap from neighbors) paired with its embedding vector and source filename, stored in the vector store.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single EOB PDF uploaded to Supabase Storage is fully ingested and queryable within 60 seconds of the ingest endpoint being called.
- **SC-002**: 100% of requests without a valid `x-ingest-secret` header result in HTTP 401 with no vector store modification.
- **SC-003**: 100% of ingest error responses (4xx and 5xx) contain no stack traces or internal file paths.
- **SC-004**: The local `npm run ingest` CLI produces identical vector store output before and after this feature is introduced (zero regression).
- **SC-005**: A request referencing a non-existent file consistently returns HTTP 500 with the exact body `{ "error": "Ingestion failed" }`.

## Assumptions

- The Supabase Storage bucket (`eob-chatbot-bucket`) is configured as publicly readable; no Supabase service-role key or auth token is required to download objects.
- The public URL pattern for Supabase Storage objects is `<SUPABASE_URL>/storage/v1/object/public/<bucket>/<filename>`.
- Only PDF files are expected at this endpoint; non-PDF handling (text files, etc.) is not required but the pipeline already handles text extraction gracefully.
- The `INGEST_SECRET` environment variable is provisioned as a strong random secret outside this codebase; key rotation is out of scope.
- Concurrent ingest requests may result in interleaved vector store writes; locking or queuing is out of scope for this feature.
- The existing `pdf-parse` and embedding dependencies are already available; no new runtime dependencies are required beyond an HTTP fetch capability (Node 20 built-in `fetch`).
- Batch ingestion (multiple files per call) is explicitly out of scope; each call processes exactly one file.
