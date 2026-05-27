# API Endpoint Contracts: Supabase Storage Ingest

**Feature**: [spec.md](../spec.md)
**Date**: 2026-05-27

---

## POST /api/ingest

Triggers ingestion of a single PDF from a public Supabase Storage bucket. The server downloads the file, chunks and embeds it, appends the chunks to the vector store, and responds synchronously.

### Request

```
POST /api/ingest
Content-Type: application/json
x-ingest-secret: <shared secret>
```

**Body**:

```json
{
  "filename": "eob-2024-q1.pdf",
  "bucket": "eob-chatbot-bucket"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `filename` | string | Yes | Non-empty, non-whitespace-only |
| `bucket` | string | Yes | Non-empty, non-whitespace-only |

**Headers**:

| Header | Required | Notes |
|--------|----------|-------|
| `Content-Type` | Yes | Must be `application/json` (enforced by `express.json()`) |
| `x-ingest-secret` | Yes | Must match `INGEST_SECRET` env var; HMAC timing-safe comparison |

---

### Responses

#### 200 OK — Ingestion successful

```json
{
  "chunksAdded": 14,
  "files": ["eob-2024-q1.pdf"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `chunksAdded` | integer ≥ 0 | Number of new chunks appended to the vector store |
| `files` | string[] | Single-element array containing the ingested filename |

---

#### 400 Bad Request — Invalid body

```json
{ "error": "filename must be a non-empty string" }
```

Returned when `filename` or `bucket` is absent, not a string, or empty/whitespace-only. The `error` field names the specific failing field.

---

#### 401 Unauthorized — Auth failure

```json
{ "error": "Unauthorized" }
```

Returned when `x-ingest-secret` is absent, empty, or does not match `INGEST_SECRET`. No ingestion or download occurs.

---

#### 500 Internal Server Error — Processing failure

```json
{ "error": "Ingestion failed" }
```

Returned when the Supabase download returns non-200, a network error occurs, PDF parsing fails, embedding fails, or the vector store write fails. The body is always exactly this shape — no stack traces, internal paths, or dependency details.

---

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Base URL of Supabase project (e.g., `https://xyz.supabase.co`) |
| `INGEST_SECRET` | Yes | Shared secret for authenticating ingest requests |

**Download URL pattern**:

```
${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}
```

---

### Behaviour Notes

- The endpoint is **synchronous**: it does not return until the full chunk → embed → persist pipeline completes.
- Calling the endpoint twice with the same filename **appends** chunks again; deduplication is out of scope.
- If `INGEST_SECRET` is unset or empty, every request returns HTTP 401 (fail-closed).
- If `SUPABASE_URL` is unset, the download URL is malformed and the endpoint returns HTTP 500.
- A PDF that yields zero extractable text returns HTTP 200 with `{ "chunksAdded": 0, "files": ["<filename>"] }`.
- The `bucket` field accepts any non-empty string; the server constructs the download URL from the caller-supplied value.
