# Feature Specification: Query API

**Feature Branch**: `002-query-api`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Express REST API with two endpoints: POST /api/query and GET /api/health, with CORS restriction, local embedding, vector search, LLM answer generation, and strict grounding/citation rules."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ask a Question and Receive a Grounded Answer (Priority: P1)

A patient submits a plain-language question about their EOB document. The system retrieves relevant excerpts from the indexed vector store, generates an answer citing exact figures, and returns it with source references.

**Why this priority**: Core value of the product — without this, no other feature matters.

**Independent Test**: Can be fully tested by sending `POST /api/query` with a question that has matching content in the store and verifying the response contains an `answer` and populated `citations`.

**Acceptance Scenarios**:

1. **Given** the vector store is loaded with EOB data, **When** a POST request is sent with `{ "question": "What is my out-of-pocket maximum?" }`, **Then** the response is HTTP 200 with `{ answer: "...<Source: ...>", citations: [{ source, excerpt, score }] }`.
2. **Given** a successful response, **When** the answer is inspected, **Then** it ends with a `Source:` line naming the file and field.
3. **Given** a successful response, **When** monetary amounts or reference numbers appear, **Then** they match verbatim values from the retrieved excerpts.
4. **Given** a successful response, **When** the answer is inspected, **Then** it describes what the document says and does not advise on payments, disputes, or medical decisions.

---

### User Story 2 — No Relevant Document Found (Priority: P1)

A patient asks a question for which no relevant chunk exists in the store. The system returns a fixed refusal without calling the LLM.

**Why this priority**: Grounding failure is as critical as success — a hallucinated answer is worse than no answer.

**Independent Test**: Send `POST /api/query` with a question on an unrelated topic and verify the fixed refusal is returned without any LLM call and with empty citations.

**Acceptance Scenarios**:

1. **Given** the vector store is loaded, **When** a POST request is sent with a question that has no chunk scoring above 0.10 and no keyword hits, **Then** the response is HTTP 200 with `{ "answer": "I can't find that in your documents.", "citations": [] }`.
2. **Given** the refusal case, **When** the response is returned, **Then** no call to the LLM provider is made.

---

### User Story 3 — Input Validation Rejects Bad Requests (Priority: P1)

A client sends a malformed or incomplete request body. The server rejects it with a clear 400 error without exposing internals.

**Why this priority**: Security and API contract correctness — validated at the system boundary.

**Independent Test**: Send POST requests with missing, empty, or non-string `question` values and verify each returns HTTP 400 with a safe error message.

**Acceptance Scenarios**:

1. **Given** a POST to `/api/query`, **When** the body is `{}` (missing `question`), **Then** the response is HTTP 400.
2. **Given** a POST to `/api/query`, **When** `question` is an empty string `""`, **Then** the response is HTTP 400.
3. **Given** a POST to `/api/query`, **When** `question` is a non-string value (e.g., `42` or `null`), **Then** the response is HTTP 400.
4. **Given** any 400 or 500 error, **When** the response body is inspected, **Then** it contains no stack trace or internal file paths.

---

### User Story 4 — Health Check (Priority: P2)

An operator or monitoring tool checks whether the service is running and the vector store is ready.

**Why this priority**: Operational requirement; does not block patient-facing functionality but enables deployment confidence.

**Independent Test**: Send `GET /api/health` and verify the response includes all required fields with correct types.

**Acceptance Scenarios**:

1. **Given** the server is running, **When** `GET /api/health` is called, **Then** the response is HTTP 200 with `{ status: "ok", provider, model, storeReady, timestamp }`.
2. **Given** the vector store has been loaded at startup, **When** the health endpoint is called, **Then** `storeReady` is `true`.

---

### User Story 5 — CORS Enforcement (Priority: P2)

A browser client from an allowed origin can reach the API; a client from an unlisted origin is blocked.

**Why this priority**: Security requirement — prevents unauthorized cross-origin access to patient data.

**Independent Test**: Send preflight and actual requests from the configured origin and from an unlisted origin; verify CORS headers are set correctly only for allowed origins.

**Acceptance Scenarios**:

1. **Given** `ALLOWED_ORIGINS` is set, **When** a request arrives from a listed origin, **Then** the response includes the correct `Access-Control-Allow-Origin` header.
2. **Given** `ALLOWED_ORIGINS` defaults to `http://localhost:5173`, **When** no env var is set and a request arrives from that origin, **Then** CORS headers are present.
3. **Given** any configuration, **When** the CORS policy is evaluated, **Then** a wildcard (`*`) is never used for `Access-Control-Allow-Origin`.

---

### Edge Cases

- What happens when the vector store file is missing or corrupt at startup?
- What happens when the LLM provider returns an error or times out?
- What happens when the question is extremely long (e.g., >2000 characters)?
- What happens when the vector store is empty (zero chunks)?
- What happens when a request arrives from an origin not in `ALLOWED_ORIGINS`?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose `POST /api/query` accepting `application/json` bodies with a `question` field.
- **FR-002**: The system MUST return HTTP 400 when `question` is absent, empty, or not a string.
- **FR-003**: The system MUST embed the question locally using the local embedding model with no call to any external embedding API.
- **FR-004**: The system MUST search the in-memory vector store and return at most 6 chunks with cosine similarity above 0.10.
- **FR-005**: The system MUST supplement vector results with keyword matches: words of 4 or more characters that appear 2 or more times in a chunk's text.
- **FR-006**: The system MUST pass only the retrieved document excerpts as context to the LLM — no outside knowledge.
- **FR-007**: The system MUST return `{ "answer": "I can't find that in your documents.", "citations": [] }` when no relevant chunks are found, without calling the LLM.
- **FR-008**: Every LLM-generated answer MUST end with a `Source:` line that names the source file and relevant field.
- **FR-009**: Monetary amounts, reference numbers, and dates in answers MUST be reproduced verbatim from the retrieved excerpts.
- **FR-010**: Answers MUST describe what the document says and MUST NOT advise on payments, disputes, or medical decisions.
- **FR-011**: The system MUST expose `GET /api/health` returning `{ status, provider, model, storeReady, timestamp }`.
- **FR-012**: CORS MUST be restricted to origins listed in the `ALLOWED_ORIGINS` environment variable (default `http://localhost:5173`); wildcard origins are prohibited.
- **FR-013**: Error responses MUST NOT expose stack traces or internal file paths to HTTP clients.
- **FR-014**: The vector store MUST be fully loaded into memory before the HTTP server begins accepting connections.

### Key Entities

- **Query Request**: A JSON object with a single `question` field (string, non-empty); the sole input to the query pipeline.
- **Chunk**: A scored document excerpt held in the vector store; has `source` (filename), `text` (raw content), and a precomputed embedding vector.
- **Citation**: An element of the response citations array; contains `source` (filename), `excerpt` (chunk text), and `score` (cosine similarity, number).
- **Query Response**: The API response object: `{ answer: string, citations: Citation[] }`.
- **Health Response**: The API response object: `{ status: "ok", provider: string, model: string, storeReady: boolean, timestamp: string }`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A valid question with matching document content returns a structured response in under 5 seconds under normal load.
- **SC-002**: 100% of requests with missing, empty, or non-string `question` values receive an HTTP 400 response.
- **SC-003**: 100% of no-match queries return the fixed refusal string without triggering an LLM call.
- **SC-004**: 100% of successful answers contain a `Source:` citation line.
- **SC-005**: No HTTP error response ever contains a stack trace or internal path in its body.
- **SC-006**: CORS headers are present for all configured origins and absent (or refused) for all others; wildcard is never emitted.
- **SC-007**: The health endpoint returns HTTP 200 with all five required fields within 100 ms.
- **SC-008**: The server accepts its first request only after the vector store is fully loaded.

## Assumptions

- The vector store (`vector_store.json`) will exist on disk when the server starts; startup failure handling for a missing file is acceptable at the operator level (process exits), not a user-facing API concern.
- The LLM model identifier (`claude-sonnet-4-6`) and Anthropic provider name are fixed configuration values read from environment or hardcoded constants; no runtime model-selection is required.
- The embedding model (`Xenova/all-MiniLM-L6-v2`) is already cached locally from the ingestion step; no network download is required at query time.
- Keyword supplement uses simple word-frequency matching on raw chunk text; no stemming or fuzzy matching is required.
- Request body size is constrained by Express defaults; no custom payload-size limit beyond that is required for v1.
- The `storeReady` field in the health response reflects whether the in-memory vector store has at least one chunk loaded.
- Pagination of results is out of scope; the API always returns a single synthesised answer.
