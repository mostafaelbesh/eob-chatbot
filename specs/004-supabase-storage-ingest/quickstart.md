# Quickstart: Supabase Storage Ingest

**Feature**: [spec.md](spec.md)
**Date**: 2026-05-27

## Prerequisites

- Node 20
- Express server running (`npm start` or `npm run dev:server`)
- `SUPABASE_URL` set in `.env` (e.g., `https://your-ref.supabase.co`)
- `INGEST_SECRET` set in `.env` (any strong random string)
- A PDF already uploaded to your Supabase Storage bucket

## Environment Setup

Add to your `.env` file:

```
SUPABASE_URL=https://your-project-ref.supabase.co
INGEST_SECRET=replace-with-a-strong-random-secret
```

## Happy-Path Test

```bash
curl -s -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: replace-with-a-strong-random-secret" \
  -d '{"filename": "eob-2024-q1.pdf", "bucket": "eob-chatbot-bucket"}'
```

Expected response (HTTP 200):

```json
{ "chunksAdded": 14, "files": ["eob-2024-q1.pdf"] }
```

## Auth Failure Test

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"filename": "eob-2024-q1.pdf", "bucket": "eob-chatbot-bucket"}'
```

Expected: `401`

## Validation Failure Test

```bash
curl -s -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: replace-with-a-strong-random-secret" \
  -d '{"filename": "", "bucket": "eob-chatbot-bucket"}'
```

Expected response (HTTP 400):

```json
{ "error": "filename must be a non-empty string" }
```

## Non-existent File Test

```bash
curl -s -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: replace-with-a-strong-random-secret" \
  -d '{"filename": "does-not-exist.pdf", "bucket": "eob-chatbot-bucket"}'
```

Expected response (HTTP 500):

```json
{ "error": "Ingestion failed" }
```

## Local CLI Fallback (unchanged)

```bash
# Place PDFs in ./data/ and run:
npm run ingest
```

The CLI reads from `./data/` and replaces the vector store. It is unaffected by the new endpoint.

## n8n Integration

Configure an HTTP Request node immediately after the Supabase upload step:

| Field | Value |
|-------|-------|
| Method | POST |
| URL | `https://your-server/api/ingest` |
| Header: `x-ingest-secret` | `{{ $env.INGEST_SECRET }}` |
| Body (JSON) | `{ "filename": "{{ $json.name }}", "bucket": "eob-chatbot-bucket" }` |

A non-200 response from the ingest endpoint should trigger an n8n error branch or alert.
