# API Requirements Quality Checklist: Supabase Storage Ingest

**Purpose**: Validate requirement completeness, clarity, and coverage for the POST /api/ingest endpoint — spanning the auth boundary, Supabase download + pipeline wiring, and error response hygiene. Author self-review before implementation.
**Created**: 2026-05-27
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 - Are request `Content-Type` requirements specified for `POST /api/ingest` (must be `application/json`)? → `contracts/api-endpoints.md`: "Must be `application/json` (enforced by `express.json()`)"
- [x] CHK002 - Are response `Content-Type` headers specified for all status codes (200, 400, 401, 500)? → Express `res.json()` sets `Content-Type: application/json` on all paths automatically; covered by framework convention
- [x] CHK003 - Are all downstream failure modes that should map to HTTP 500 enumerated (network error, PDF parse error, embed error, vector store write error)? → `contracts/api-endpoints.md` 500 note enumerates all five; `data-model.md` state transitions confirm
- [x] CHK004 - Is there a requirement to log the real error details server-side when the generic `{ "error": "Ingestion failed" }` 500 is returned to the caller? → `tasks.md` T009: "`console.error(err.message)` before returning 500"
- [x] CHK005 - Are requirements defined for a non-JSON or structurally malformed request body (beyond missing individual fields)? → `express.json()` returns 400 on malformed JSON before the handler runs; empty body triggers field validation → 400; covered by middleware

## Requirement Clarity

- [x] CHK006 - Is "non-empty string" for `filename` and `bucket` explicitly defined to exclude whitespace-only strings (e.g., `"   "`)? → `data-model.md` validation rules + `tasks.md` T005: `typeof === 'string' && value.trim() !== ''`
- [x] CHK007 - Is "append to vector store" in FR-004 clarified to mean existing entries are preserved rather than the store being overwritten? → `research.md` R-002: "preserves existing entries while adding new ones"; `plan.md` key decisions table
- [x] CHK008 - Is the `chunksAdded` field specified as an integer type (not a float or stringified number)? → `contracts/api-endpoints.md`: "integer ≥ 0"; `data-model.md` IngestResult entity: "`number` (integer ≥ 0)"
- [x] CHK009 - Is the `files` array in the 200 response specified to always contain exactly one element given the one-file-per-call constraint? → `contracts/api-endpoints.md`: "Single-element array containing the ingested filename"; `data-model.md` same
- [x] CHK010 - Is URL encoding handling for `filename` values containing special characters (spaces, non-ASCII, slashes) specified before URL construction? → `research.md` R-005: `encodeURIComponent` explicitly chosen with documented rationale; URL pattern in `contracts/api-endpoints.md`
- [x] CHK011 - Is the comparison behaviour specified when the `INGEST_SECRET` environment variable contains leading or trailing whitespace? → Accepted: `research.md` R-003 uses exact HMAC digest comparison by design; operators are responsible for correct env var values; dotenv preserves spaces — this is expected behaviour

## Acceptance Criteria Quality

- [x] CHK012 - Can the "within 60 seconds" latency requirement in SC-001 be measured objectively without depending on external network conditions? → Accepted: `plan.md` explicitly designates SC-001 as an "informal" wall-clock bound, not a hard SLA; no automated latency test is required for this feature
- [x] CHK013 - Is "identical vector store output" in SC-004 defined with specific comparison criteria (e.g., same chunk count, same source filenames, same embeddings)? → `tasks.md` T010–T011: exit code 0 + chunks with correct `source` filename — sufficient for CLI regression verification
- [x] CHK014 - Is SC-002's "no vector store modification" criterion verifiable by a concrete before/after state comparison on an unauthorized request? → Architecturally guaranteed: `data-model.md` state machine returns 401 before any `append()` call; no state change is possible on auth failure

## Scenario Coverage

- [x] CHK015 - Are requirements defined for the case where the Supabase Storage fetch returns a non-200 status (e.g., 403, 404) rather than a network-level error? → `data-model.md` state transitions: "FAIL (non-200 or network error) → HTTP 500"; `tasks.md` T009: checks `!response.ok` to surface non-200 as a caught error
- [x] CHK016 - Are requirements defined for a request sent with the wrong `Content-Type` (e.g., `application/x-www-form-urlencoded`)? → `express.json()` does not parse non-JSON bodies; `req.body` is empty → field validation fires → HTTP 400; handled by existing middleware
- [x] CHK017 - Is the concurrent ingest request scenario (interleaved vector store writes) explicitly acknowledged as an accepted risk in requirements rather than left as an undocumented assumption? → `spec.md` Assumptions: "Concurrent ingest requests may result in interleaved vector store writes; locking or queuing is out of scope for this feature"

## Edge Case Coverage

- [x] CHK018 - Is the behaviour for a zero-byte or structurally corrupt PDF (not just zero-extractable-text) specified? → `spec.md` edge cases: zero-text PDF → HTTP 200 `chunksAdded:0`; corrupt PDF → `pdf-parse` throws → caught by try/catch → HTTP 500 (`data-model.md` state machine)
- [x] CHK019 - Is there a requirement to validate that `filename` contains no path traversal sequences (e.g., `../`, URL-encoded variants) before constructing the download URL? → `research.md` R-005: `encodeURIComponent` converts `../` to `..%2F`; Supabase Storage does not resolve percent-encoded slashes as path separators — encoding provides the safety mechanism
- [x] CHK020 - Is there a requirement to validate that `bucket` contains no path traversal or injection sequences before it is interpolated into the download URL? → Same as CHK019: `encodeURIComponent(bucket)` in R-005 handles this

## Security Requirements

- [x] CHK021 - Is there a requirement for timing-safe secret comparison to prevent timing side-channel attacks on `x-ingest-secret`? → `research.md` R-003: HMAC-SHA256 digest + `crypto.timingSafeEqual`; `plan.md` key decisions; `tasks.md` T003 implements it
- [x] CHK022 - Is there a requirement to validate the `bucket` value against an allowlist or naming pattern to prevent unintended cross-bucket access? → Accepted deliberate non-requirement: `contracts/api-endpoints.md` notes "bucket accepts any non-empty string"; endpoint is authenticated via `INGEST_SECRET`, limiting access to authorised callers only; flexibility for future multi-bucket use is intentional
- [x] CHK023 - Is the 401 response body format specified (empty body, or a `{ error }` shape) to avoid leaking information about why authentication failed? → `contracts/api-endpoints.md`: `{ "error": "Unauthorized" }`; `data-model.md` validation rules table

## Non-Functional Requirements

- [x] CHK024 - Are download timeout requirements specified for the Supabase Storage `fetch` call to bound worst-case response time? → Accepted gap: `spec.md` Assumptions: "Node 20 built-in fetch is sufficient" — no timeout in scope for this feature; deferred to a future hardening pass
- [x] CHK025 - Are file size limits specified for downloadable PDFs to prevent memory exhaustion from abnormally large uploads? → Accepted gap: out of scope per feature spec; large-PDF memory handling deferred to a future hardening pass

## Dependencies & Assumptions

- [x] CHK026 - Is the assumption that Node 20 built-in `fetch` is sufficient for Supabase Storage downloads validated, or does it require a specific polyfill? → `spec.md` Assumptions + `research.md` R-001: Node 20 built-in fetch confirmed sufficient; no polyfill required
- [x] CHK027 - Is the Supabase public URL pattern (`<SUPABASE_URL>/storage/v1/object/public/<bucket>/<filename>`) treated as a stable contract, and is there a requirement to document where this pattern is sourced? → `spec.md` Assumptions documents the pattern; `research.md` R-005 uses and references it explicitly
