# Data Model: React Chat UI

**Feature**: 003-react-chat-ui
**Date**: 2026-05-25

---

## Entities

### Message

Represents a single turn in the chat conversation. Held in the `messages` React state array.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique identifier; generated with `crypto.randomUUID()` at creation time |
| `role` | `'user' \| 'bot'` | yes | Determines bubble alignment and styling |
| `text` | `string` | yes | Display text; for user messages, the raw input; for bot messages, the `answer` from the API |
| `isError` | `boolean` | no (bot only) | `true` when the bubble was created from an HTTP error or network failure |
| `isRefusal` | `boolean` | no (bot only) | `true` when `text` matches the refusal regex; drives the amber badge |
| `citations` | `Citation[]` | no (bot only) | Empty array when absent in the API response; never `undefined` for bot messages |

**Validation rules**:
- `text` must be a non-empty string before a user message is committed to state (FR-016)
- `citations` defaults to `[]` when the API response omits the field

---

### Citation

A single grounding reference attached to a bot message.

| Field | Type | Required | Description |
|---|---|---|---|
| `filename` | `string` | yes | Source document filename as returned by the API |
| `excerpt` | `string` | yes | Relevant text excerpt from the source document |

---

## React State

```
messages: Message[]     — ordered chat history (append-only during a session)
input:    string        — current textarea value; reset to '' on submit
loading:  boolean       — true while the POST /api/query fetch is in flight
error:    string|null   — human-readable error message; null when no active error
```

---

## Derived Computations (in render)

| Computed | Source | Description |
|---|---|---|
| `hasMessages` | `messages.length > 0` | Controls visibility of suggested-question buttons |
| `isRefusal` (per message) | `REFUSAL_RE.test(msg.text)` | Computed once at message-creation time, stored on `msg.isRefusal` |

---

## Constants

```js
const REFUSAL_RE = /can't find|cannot find|not found|not in your documents/i;

const SUGGESTED_QUESTIONS = [
  "The provider billed me $160 -- do I owe it?",
  "The doctor is threatening collections -- am I protected?",
  "How close am I to my in-network deductible?",
  "What is my dental copay?",
];
```

---

## State Transitions

```
IDLE  ──[user submits]──►  LOADING
         (push user bubble, set loading=true, clear error)

LOADING  ──[API success]──►  IDLE
              (push bot bubble with answer+citations, set loading=false)

LOADING  ──[API error]──►  ERROR_SHOWN
              (push bot error bubble, set error string, set loading=false)

ERROR_SHOWN  ──[user submits next message]──►  LOADING
                  (clear error, then same as IDLE→LOADING)
```

---

## File Layout

```
client/
├── package.json          — React 18 + react-dom 18 deps; vite ^5 + @vitejs/plugin-react ^4 devDeps
├── vite.config.js        — React plugin; server.port=5173; proxy /api → http://localhost:3001
├── index.html            — HTML shell; <div id="root">; imports /src/main.jsx
└── src/
    ├── main.jsx          — ReactDOM.createRoot('#root').render(<App />)
    └── App.jsx           — All state, all handlers, all render logic
```

No routing, no context, no external state library.
