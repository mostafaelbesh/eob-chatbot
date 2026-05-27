# Data Model: Supabase Storage Ingest

**Feature**: [spec.md](spec.md)
**Date**: 2026-05-27

## Entities

### IngestRequest

A caller-supplied payload delivered as the JSON body of `POST /api/ingest`.

| Field | Type | Validation |
|-------|------|------------|
| `filename` | `string` | Required; `typeof === 'string'` and `trim() !== ''` |
| `bucket` | `string` | Required; `typeof === 'string'` and `trim() !== ''` |

Authentication is carried in the `x-ingest-secret` request header, validated against `INGEST_SECRET` env var before the body is processed.

---

### IngestResult

The synchronous response body on successful ingestion (HTTP 200).

| Field | Type | Description |
|-------|------|-------------|
| `chunksAdded` | `number` (integer ≥ 0) | Count of new document chunks appended to the vector store |
| `files` | `string[]` | Single-element array containing the ingested `filename` |

---

### DocumentChunk

A single unit of the vector store. Schema is unchanged from the existing pipeline.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Text segment ≤ 300 characters |
| `source` | `string` | Original filename |
| `chunkIndex` | `number` | Zero-based position within the source document |
| `embedding` | `number[]` | 384-dimensional float array from `Xenova/all-MiniLM-L6-v2` |

---

## State Transitions

```
POST /api/ingest received
        │
        ▼
[AUTH] x-ingest-secret vs INGEST_SECRET (HMAC timing-safe)
        ├── FAIL → HTTP 401 { "error": "Unauthorized" }       (no state change)
        │
        ▼
[VALIDATE] filename + bucket present and non-empty
        ├── FAIL → HTTP 400 { "error": "<field> must be a non-empty string" } (no state change)
        │
        ▼
[DOWNLOAD] fetch(SUPABASE_URL/storage/v1/object/public/bucket/filename)
        ├── FAIL (non-200 or network error) → HTTP 500 { "error": "Ingestion failed" } (no state change)
        │
        ▼
[PARSE] pdf-parse(buffer) → text
        ├── FAIL → HTTP 500 { "error": "Ingestion failed" }   (no state change)
        │
        ▼
[CHUNK] chunkText(text) → string[] (300 chars / 50 overlap / 20 min)
        │  (zero chunks is valid — continues to HTTP 200)
        ▼
[EMBED] embed(chunk) for each chunk  [local, Xenova]
        ├── FAIL → HTTP 500 { "error": "Ingestion failed" }   (no state change)
        │
        ▼
[APPEND] vectorStore.append(newChunks)  ← mutates vector_store.json
        ├── FAIL → HTTP 500 { "error": "Ingestion failed" }
        │
        ▼
HTTP 200 { chunksAdded: N, files: [filename] }
```

---

## Validation Rules

| Field | Rule | HTTP | Error body |
|-------|------|------|------------|
| `x-ingest-secret` | HMAC-timing-safe equal to `INGEST_SECRET` | 401 | `{ "error": "Unauthorized" }` |
| `filename` | `typeof === 'string' && filename.trim() !== ''` | 400 | `{ "error": "filename must be a non-empty string" }` |
| `bucket` | `typeof === 'string' && bucket.trim() !== ''` | 400 | `{ "error": "bucket must be a non-empty string" }` |

Validation order: auth check → body field validation → downstream processing.

---

## Modified Module: vectorStore.js

New export added (no existing exports changed):

| Export | Signature | Behaviour |
|--------|-----------|-----------|
| `append` | `async append(newEntries: object[]) → void` | Pushes `newEntries` onto in-memory `store`, then persists full store to `vector_store.json` |

The existing `save(entries)` export is unchanged and continues to be used by the CLI to replace the store wholesale.

---

## New Module: src/routes/ingest.js

| Export | Type | Description |
|--------|------|-------------|
| default | `express.Router` | Handles `POST /` (mounted at `/api/ingest` in server.js) |

Internal constants (not exported):

| Constant | Value |
|----------|-------|
| `CHUNK_SIZE` | `300` |
| `CHUNK_OVERLAP` | `50` |
| `CHUNK_STEP` | `250` |
| `MIN_CHUNK_LENGTH` | `20` |
