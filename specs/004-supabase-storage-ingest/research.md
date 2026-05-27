# Research: Supabase Storage Ingest

**Feature**: [spec.md](spec.md)
**Date**: 2026-05-27

## R-001: PDF Buffer Processing

**Decision**: Use `Buffer.from(await response.arrayBuffer())` after `fetch()` to obtain a Node.js Buffer, then pass it directly to `pdf-parse(buffer)`.

**Rationale**: `pdf-parse` accepts a `Buffer` as its primary argument — confirmed by the existing CLI usage in `ingest.js` where `fs.readFileSync(filePath)` (which returns a Buffer) is passed directly. Node 20 built-in `fetch` exposes `Response.arrayBuffer()` for binary payloads. No additional dependency is required.

**Alternatives considered**: `node-fetch` (unnecessary — Node 20 fetch is built-in and equivalent for this use case), streaming via `response.body` pipe (unnecessary complexity for single-file synchronous ingest).

---

## R-002: Vector Store Append

**Decision**: Add a new `append(newEntries)` function to `vectorStore.js`. It pushes `newEntries` into the in-memory `store` array and persists the full updated store via `fs.promises.writeFile`.

**Rationale**: The existing `save(entries)` replaces the entire store — that is the correct behaviour for the CLI, which re-indexes from scratch. A separate `append()` preserves existing entries while adding new ones, satisfying FR-004 without touching the CLI codepath and without exposing internal state to the route handler.

**Alternatives considered**: Calling `getAll().concat(newEntries)` then `save()` from the route handler (rejected — exposes store internals to the caller and duplicates the persistence logic).

---

## R-003: Timing-Safe Secret Comparison

**Decision**: Compute `crypto.createHmac('sha256', 'eob-compare').update(input).digest()` for both the header value and the env var value, then compare the two 32-byte digests using `crypto.timingSafeEqual(ha, hb)`. If `INGEST_SECRET` is falsy (unset or empty string), return `false` immediately (fail-closed).

**Rationale**: `crypto.timingSafeEqual` requires equal-length Buffers and throws on a length mismatch. Comparing HMAC-SHA256 digests (always 32 bytes) eliminates the length-leak problem while still preventing timing side-channels. The HMAC key (`'eob-compare'`) is a fixed internal string — it is not a secret; its sole purpose is to produce fixed-length, collision-resistant representations for safe comparison.

**Alternatives considered**: Direct `===` string comparison (vulnerable to timing attacks), `crypto.timingSafeEqual` with a length pre-check (leaks whether the lengths differ before the safe comparison runs).

---

## R-004: Chunking Logic — Shared vs Duplicated

**Decision**: Inline the `chunkText` function and its constants (`CHUNK_SIZE=300`, `CHUNK_OVERLAP=50`, `MIN_CHUNK_LENGTH=20`) directly in `src/routes/ingest.js`. Do not modify `src/ingest.js`.

**Rationale**: FR-008 guarantees the CLI is unchanged. Extracting to a shared module requires touching `ingest.js`, introducing regression risk. Duplicating a ~10-line pure function avoids that risk and satisfies the "avoid over-engineering" principle — the function has exactly two consumers and no complex variation.

**Alternatives considered**: Shared `src/chunker.js` module (rejected — requires modifying `ingest.js`, adds refactoring risk with no proportional benefit for a single additional consumer).

---

## R-005: URL Construction and Encoding

**Decision**: Construct the download URL as:

```
`${process.env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`
```

**Rationale**: `encodeURIComponent` ensures filenames and bucket names with spaces, non-ASCII characters, or special characters are safely percent-encoded. The URL pattern is documented in the spec assumptions as `<SUPABASE_URL>/storage/v1/object/public/<bucket>/<filename>`.

**Alternatives considered**: No encoding (rejected — fails for filenames containing spaces, which are common in EOB documents), `encodeURI` (rejected — does not encode `#`, `?`, `&`, which are syntactically meaningful in URLs but legal in filenames).

---

## R-006: INGEST_SECRET Absent Behaviour

**Decision**: If `process.env.INGEST_SECRET` is falsy (undefined or empty string), the comparison function returns `false` for any input — every ingest request returns HTTP 401.

**Rationale**: Fail-closed behaviour matches the spec edge case ("The server should treat any presented secret as non-matching"). A misconfigured deployment is safer than an open write endpoint.

**Alternatives considered**: Returning HTTP 500 to indicate misconfiguration (rejected — would leak server configuration state to callers).

---

## R-007: Route Placement

**Decision**: Implement the handler in a new file `src/routes/ingest.js` exporting an Express Router, mounted in `server.js` with `app.use('/api/ingest', ingestRouter)`.

**Rationale**: Keeps `server.js` at a manageable size, isolates the ingest pipeline logic for independent review and testing, and follows the natural extension of the existing project structure. The middleware and validators directories are currently empty, suggesting routes are the appropriate unit of isolation.

**Alternatives considered**: Inline handler directly in `server.js` (acceptable for a single route but makes the file harder to review as more routes are added).
