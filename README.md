# EOB Chatbot

A RAG (Retrieval-Augmented Generation) chatbot that answers patient questions about insurance Explanation of Benefits (EOB) documents. Questions are answered using grounded excerpts from source documents, with exact figures and citations.

## Stack

- **Node 20 + Express 4** — REST API server
- **Anthropic Claude** — answer generation
- **`@xenova/transformers`** — local embeddings (`all-MiniLM-L6-v2`, quantized; no external embedding API call)
- **`pdf-parse`** — PDF text extraction
- **React 18 + Vite 5** — chat UI
- **Supabase Storage** — PDF document source (triggered via n8n automation)

## Project Structure

```
src/
├── server.js        # Express entry point
├── query.js         # Query pipeline: embed → search → LLM → citations
├── llm.js           # Anthropic Claude integration
├── embedder.js      # Local embedder (cached in .xenova-cache/)
├── vectorStore.js   # In-memory + disk vector store (vector_store.json)
├── ingest.js        # Local CLI ingest script
└── routes/
    └── ingest.js    # POST /api/ingest — Supabase-triggered ingestion
client/              # React chat UI
data/                # Local PDFs for CLI ingestion
vector_store.json    # Persisted chunk embeddings
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   cd client && npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env` and fill in values:

   ```
   PORT=3001
   ANTHROPIC_API_KEY=your-api-key-here
   ANTHROPIC_MODEL=claude-sonnet-4-6
   ALLOWED_ORIGINS=http://localhost:5173
   SUPABASE_URL=https://your-project-ref.supabase.co
   INGEST_SECRET=replace-with-a-strong-random-secret
   ```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run ingest` | Ingest local PDFs from `./data/` into the vector store |
| `npm start` | Start the Express server on `PORT` (default 3001) |
| `npm run dev:server` | Start server with `--watch` for auto-reload |
| `npm run dev:client` | Start Vite dev server on port 5173 (proxies `/api` to 3001) |
| `npm run build:client` | Build the React UI to `client/dist/` |
| `npm run test:gold` | Run 6 gold-row assertions against the live server |

## Ingestion

### Local CLI

Place PDFs in `./data/` then run:

```bash
npm run ingest
```

Chunks each PDF at 300 chars / 50 overlap, embeds locally, and writes `vector_store.json`.

### Supabase Automation (n8n)

An n8n workflow uploads a PDF to the Supabase Storage bucket, then POSTs to `/api/ingest`:

```bash
curl -X POST http://localhost:3001/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: <INGEST_SECRET>" \
  -d '{"filename": "eob-2024-q1.pdf", "bucket": "eob-chatbot-bucket"}'
```

Response (HTTP 200):

```json
{ "chunksAdded": 14, "files": ["eob-2024-q1.pdf"] }
```

## API Reference

### `GET /api/health`

Returns server status and vector store readiness.

### `POST /api/query`

| Field | Type | Description |
|-------|------|-------------|
| `question` | `string` | Patient's plain-language question |

Response: `{ answer, citations }`

### `POST /api/ingest`

| Header / Field | Description |
|----------------|-------------|
| `x-ingest-secret` (header) | Must match `INGEST_SECRET` env var |
| `filename` (body) | PDF filename in the Supabase bucket |
| `bucket` (body) | Supabase Storage bucket name |

| Status | Meaning |
|--------|---------|
| 200 | Ingestion succeeded — `{ chunksAdded, files }` |
| 400 | Missing or empty `filename` / `bucket` |
| 401 | Invalid or missing `x-ingest-secret` |
| 500 | Download or processing failure — `{ "error": "Ingestion failed" }` |

## Response Principles

1. **Grounding-only** — answers come exclusively from retrieved document excerpts
2. **Citations mandatory** — every answer includes a source line (file + field)
3. **Fail-closed** — no relevant chunks found → `"I can't find that in your documents."`
4. **Exact-figure fidelity** — monetary amounts, reference numbers, and dates returned verbatim
5. **Privacy boundary** — embeddings are local; no patient data sent to external services except anonymised excerpts to Anthropic
6. **No advice** — describes what documents say; never advises on payments, disputes, or medical decisions

## Development

Run the server and client concurrently in two terminals:

```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:client
```

The React UI is available at `http://localhost:5173`. In production, `npm start` serves the built client as static files from `client/dist/`.
