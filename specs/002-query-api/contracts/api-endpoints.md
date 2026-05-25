# API Contracts: Query API

## Base URL

`http://localhost:3001` (configurable via `PORT` env var)

---

## POST /api/query

Accepts a patient question, executes the RAG pipeline, and returns a grounded answer with citations.

### Request

```
POST /api/query
Content-Type: application/json
```

**Body**:
```json
{
  "question": "string — required, non-empty"
}
```

**Validation rules** (HTTP 400 returned on violation):

| Condition | Error |
|---|---|
| Body is not valid JSON | 400 |
| `question` field is absent | 400 |
| `question` is not a string | 400 |
| `question` is empty or whitespace | 400 |

### Responses

#### 200 OK — answer found

```json
{
  "answer": "Your out-of-pocket maximum is $3,500.00 as listed under Member Liability.\n\nSource: eob-2024.txt — Member Liability / Out-of-Pocket Maximum",
  "citations": [
    {
      "source": "eob-2024.txt",
      "excerpt": "Member Liability: Out-of-Pocket Maximum $3,500.00",
      "score": 0.87
    }
  ]
}
```

**Field types**:

| Field | Type | Notes |
|---|---|---|
| `answer` | string | Ends with a `Source:` line (§2); figures are verbatim (§4); no advice (§6) |
| `citations` | array | 1–6 elements; each element is a Citation object (see below) |
| `citations[].source` | string | Basename of source file |
| `citations[].excerpt` | string | Verbatim chunk text; never modified |
| `citations[].score` | number | Cosine similarity [0, 1]; 0 for keyword-only hits |

#### 200 OK — no relevant content found (§3 Fail-Closed)

```json
{
  "answer": "I can't find that in your documents.",
  "citations": []
}
```

Returned when no chunk exceeds `MIN_SCORE=0.10` and no keyword hits are found. The LLM is **not** called.

#### 400 Bad Request

```json
{
  "error": "question must be a non-empty string"
}
```

No stack trace. No internal path. Safe for browser display.

#### 500 Internal Server Error

```json
{
  "error": "Internal server error"
}
```

Generic message only. Never contains `err.stack`, file paths, or dependency details.

---

## GET /api/health

Returns the operational status of the service.

### Request

```
GET /api/health
```

No body or query parameters.

### Response

#### 200 OK

```json
{
  "status": "ok",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "storeReady": true,
  "timestamp": "2026-05-25T10:00:00.000Z"
}
```

**Field types**:

| Field | Type | Notes |
|---|---|---|
| `status` | string | Always `"ok"` |
| `provider` | string | Always `"anthropic"` |
| `model` | string | Value of `ANTHROPIC_MODEL` env var |
| `storeReady` | boolean | `true` when store has ≥ 1 chunk |
| `timestamp` | string | ISO 8601 UTC |

---

## CORS Policy

- Allowed origins: comma-separated values in `ALLOWED_ORIGINS` env var (default `http://localhost:5173`)
- Wildcard (`*`) is **never** emitted
- Requests from unlisted origins receive no CORS headers (browser blocks the request)
- Same-origin requests (no `Origin` header) are always permitted

---

## Error Contract

All error responses:
- Use `application/json` content type
- Have a single `"error"` string field
- Never include stack traces, internal paths, or dependency version strings
- Use standard HTTP status codes only: `400` for validation failures, `500` for unexpected server errors
