# UI Contracts: React Chat UI

**Feature**: 003-react-chat-ui
**Date**: 2026-05-25

---

## API Dependency: POST /api/query

The React UI depends on the server-side contract from feature 002. This document captures only the client-facing subset that the UI reads.

### Request

```
POST /api/query
Content-Type: application/json

{
  "question": string   // non-empty; sent as-is from textarea input
}
```

### Success Response (200)

```json
{
  "answer": "string",
  "citations": [
    {
      "filename": "string",
      "excerpt": "string"
    }
  ]
}
```

The UI MUST handle:
- `citations` present and non-empty → render citations block (FR-009)
- `citations` present and empty → render nothing (FR-010)
- `citations` absent → treat as empty array (FR-010)
- `answer` matching `/can't find|cannot find|not found|not in your documents/i` → render refusal badge instead of citation block (FR-011)

### Error Response (4xx / 5xx)

Any non-2xx HTTP status OR a `fetch()` network rejection triggers the error path:
- Set `error` state to a human-readable message
- Push a bot bubble with `isError: true`
- Render error bar above the message list (FR-008)

---

## Component Render Contract

### App (root component)

**Props**: none

**Emitted DOM structure (logical)**:
```
<div> [page root, full-height flex column]
  <header> [navy bg, title]
  {error && <div> [error bar, red bg]}
  <div> [message list, flex-grow, overflow-y auto]
    {messages.map → MessageBubble}
    {loading && TypingIndicator}
    <div ref={bottomRef} /> [scroll anchor]
  {!hasMessages && <div> [suggested questions grid]}
  <div> [input bar, white bg, flex row]
    <textarea> [disabled when loading]
    <button> [Send, disabled when loading]
```

### MessageBubble (inline render, not a separate file)

| State | Rendered output |
|---|---|
| `role === 'user'` | Right-aligned bubble, bg `#f0f4f8` |
| `role === 'bot'`, no refusal, citations present | Left-aligned bubble + citations block |
| `role === 'bot'`, no refusal, no citations | Left-aligned bubble only |
| `role === 'bot'`, `isRefusal === true` | Left-aligned bubble + amber badge |
| `role === 'bot'`, `isError === true` | Left-aligned bubble, error text |

### TypingIndicator (inline render)

Renders a left-aligned bot bubble whose text cycles through `"."`, `".."`, `"..."` using `setInterval` in a `useEffect`. Interval cleared when `loading` becomes `false`.

### SuggestedQuestions (inline render)

Visible only when `messages.length === 0`. Four `<button>` elements. On click: set `input` to the question text and immediately invoke the submit handler.

---

## Key Constraints

- All styles: inline `style={{}}` props only — no CSS file, no CSS module, no framework (FR-014)
- No routing: single `App` component, single `<div id="root">` mount (FR-001)
- No state library: `useState`, `useRef`, `useEffect` only (explicit user requirement)
- Proxy: Vite dev server proxies `/api` to `http://localhost:3001`; production uses relative path `/api/query` which Express serves directly
