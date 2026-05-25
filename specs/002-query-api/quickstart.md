# Quickstart: Query API

## Prerequisites

- Node 20 installed
- `npm install` run at project root
- `vector_store.json` present (run `npm run ingest` first if absent)
- `ANTHROPIC_API_KEY` set in `.env` at project root

## Environment Setup

Create a `.env` file at the project root if one does not already exist:

```env
ANTHROPIC_API_KEY=your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-6
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

`ANTHROPIC_MODEL`, `PORT`, and `ALLOWED_ORIGINS` are optional — defaults are used if absent.

## Start the Server

```bash
npm start
```

Or in watch mode during development:

```bash
npm run dev:server
```

The server logs `Server listening on port 3001` once the vector store is loaded and the HTTP server is ready. No requests are accepted until that log line appears.

## Test the Endpoints

### Health check

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{ "status": "ok", "provider": "anthropic", "model": "claude-sonnet-4-6", "storeReady": true, "timestamp": "..." }
```

### Query — matching document content

```bash
curl -s -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is my deductible?"}'
```

Expected: HTTP 200 with `answer` ending in a `Source:` line and at least one element in `citations`.

### Query — no relevant content

```bash
curl -s -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the capital of France?"}'
```

Expected: HTTP 200 with `{ "answer": "I can't find that in your documents.", "citations": [] }`.

### Validation error

```bash
curl -s -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: HTTP 400.

## Run Gold Tests

With the server running on port 3001:

```bash
node test-gold.js
```

All 6 assertions must pass. The script exits 0 on success and 1 on any failure, printing which assertion failed.

## Multiple Allowed Origins

To allow multiple frontend origins, separate them with commas in `.env`:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.example.com
```
