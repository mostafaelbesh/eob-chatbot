# Implementation Plan: React Chat UI

**Branch**: `003-react-ui` | **Date**: 2026-05-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-react-chat-ui/spec.md`

## Summary

React 18 + Vite 5 single-page chat UI in `client/`. All logic in a single `App.jsx` — four `useState` variables (`messages`, `input`, `loading`, `error`), one `useRef` scroll anchor. Submitting a question via Enter or Send button optimistically appends a user bubble, disables input, shows a typing indicator, and POSTs to `POST /api/query`. On success it appends a bot bubble with optional citations block; on failure it sets an error bar and an error bubble. A refusal badge replaces the citation block when the answer matches the refusal regex. Four suggested-question buttons are shown only in the empty state. Inline styles only; no CSS framework, no routing, no state library.

## Technical Context

**Language/Version**: JavaScript ES2022 (JSX), React 18.3, Vite 5

**Primary Dependencies**: `react ^18`, `react-dom ^18`; devDependencies: `vite ^5`, `@vitejs/plugin-react ^4`

**Storage**: N/A — no client-side persistence; session state lives in React memory only

**Testing**: Manual verification against the success criteria in the spec; no automated test runner introduced by this feature

**Target Platform**: Modern desktop browser (Chrome, Edge, Firefox); served by Vite dev server on port 5173 in dev, by Express static fallback in production

**Project Type**: Single-page web application (frontend)

**Performance Goals**: No perceptible UI-side delay beyond network round-trip; optimistic bubble render is synchronous (SC-001)

**Constraints**: Inline styles only (FR-014); no routing library; no state management library; `useState` + `useRef` + `useEffect` only; no JSDoc, no banner comments, no emojis (FR-015); Shift+Enter inserts newline, Enter submits (FR-002)

**Scale/Scope**: Single-user, single-session MVP; no pagination, no conversation history persistence

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — all gates still pass.*

| Principle | Status | Notes |
|---|---|---|
| §1 Grounding-Only | PASS (N/A) | UI renders API response verbatim; no answer generation in the client |
| §2 Citations-Mandatory | PASS | Citations block rendered when citations array is non-empty (FR-009); block absent when empty/absent (FR-010) |
| §3 Fail-Closed | PASS | Error bar + error bot bubble rendered on any non-2xx or network failure (FR-008) |
| §4 Exact-Figure Fidelity | PASS | Answer text rendered as-is; no transformation applied to `answer` or `citations` fields |
| §5 Privacy Boundary | PASS | Only `{ question: string }` leaves the browser; no PHI stored client-side; all embedding is server-side |
| §6 No-Advice | PASS (N/A) | UI is a dumb render layer; no advice logic present |
| Code — No JSDoc | PASS | FR-015 explicitly required; enforced in implementation |
| Code — No section banners | PASS | FR-015 explicitly required; enforced in implementation |
| Code — Async I/O | PASS (N/A) | Client-side only; server-path I/O rules do not apply |
| CORS | PASS (N/A) | Enforced server-side; Vite proxy eliminates CORS preflight in dev |
| Error response safety | PASS (N/A) | Enforced server-side; client only reads `error` field from JSON |
| Input validation | PASS | `input.trim() === ''` guard before any fetch (FR-016) |

*All gates PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/003-react-chat-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-contracts.md  # Phase 1 output
└── tasks.md             # Phase 2 output (not created here — /speckit.tasks)
```

### Source Code

```text
client/                    # NEW — standalone Vite 5 app
├── package.json           # NEW — react ^18, react-dom ^18; vite ^5, @vitejs/plugin-react ^4
├── vite.config.js         # NEW — React plugin; port 5173; proxy /api → http://localhost:3001
├── index.html             # NEW — HTML shell; <div id="root">
└── src/
    ├── main.jsx           # NEW — ReactDOM.createRoot mount
    └── App.jsx            # NEW — all state, all handlers, all render logic
```

**Structure Decision**: Frontend-only subdirectory (`client/`) separate from the Node server root. No files added to `src/`. Express `src/server.js` already serves `client/dist` as a static fallback; no changes to server code are required by this feature.
