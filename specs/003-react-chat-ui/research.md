# Research: React Chat UI

**Feature**: 003-react-chat-ui
**Date**: 2026-05-25
**Phase**: 0 — Research

---

## Decision 1: Vite 5 `client/` subdirectory configuration

**Decision**: Use a standalone `client/package.json` with its own `node_modules`. The Vite dev server runs on port 5173 and proxies `/api/*` to `http://localhost:3001`. Production build outputs to `client/dist/`, which Express serves as a static fallback via `express.static`.

**Rationale**: Separating the client from the server root keeps Node module resolution clean (no accidental server imports in browser bundles), and the existing `copilot-instructions.md` already assumes this layout. The proxy avoids CORS preflight on the dev path.

**Alternatives considered**: Monorepo workspace — rejected as unnecessary complexity for a single-user MVP with one frontend and one backend.

---

## Decision 2: Single-file component (`App.jsx`) vs. split components

**Decision**: All UI logic lives in `client/src/App.jsx`. No sub-components in separate files.

**Rationale**: The spec has four user stories but they all share a single state tree (`messages`, `input`, `loading`, `error`). Splitting into sub-components would require prop-drilling or a context, neither of which is warranted at this scale. The copilot instructions already name `client/src/App.jsx` as the single artifact.

**Alternatives considered**: `MessageList.jsx` + `InputBar.jsx` split — rejected; over-engineered for the current scope.

---

## Decision 3: State shape

**Decision**: Two top-level state variables: `messages` (array of message objects) and `input` (string). Two derived booleans computed inside render: `loading` (last message is a sentinel placeholder) and `error` (separate `useState` string). A `useRef` on the message container enables auto-scroll.

**Rationale**: Keeping state minimal avoids redundant re-renders. The `loading` state is reflected by the presence of a placeholder bot bubble rather than a separate flag, reducing synchronisation bugs.

**Revised decision**: Use an explicit `loading` boolean alongside `messages` for clarity. Separating the in-flight indicator from committed messages prevents a race where a slow response could cause double-bubble rendering.

**Final state shape**:
```
messages: Message[]     useState
input:    string        useState
loading:  boolean       useState
error:    string|null   useState
bottomRef: RefObject    useRef (for scroll-into-view)
```

---

## Decision 4: Typing indicator implementation

**Decision**: While `loading === true`, render a placeholder bot bubble containing three animated dots using a CSS `@keyframes` animation injected once via a `<style>` tag in `index.html`, or via a `useEffect` that appends a `<style>` to `document.head`. Given the inline-styles-only constraint, use a `useEffect` to inject a minimal `<style>` block on mount for the keyframe animation only (no class-based styling). Alternatively, use a pure JS interval + React state to cycle the dot count (`"."` → `".."` → `"..."`) — this requires zero CSS injection and stays fully inline.

**Final decision**: Pure JS interval approach (`useEffect` with `setInterval`, cycling dot state `1→2→3→1`). No `<style>` injection needed.

**Alternatives considered**: CSS `@keyframes` injection — valid but technically violates "inline styles only" spirit. Three static dots with opacity animation via inline `style` transforms — more complex than the interval approach.

---

## Decision 5: Refusal detection

**Decision**: A single regex applied to the answer text: `/can't find|cannot find|not found|not in your documents/i`. Evaluated once when the bot message is added to state. The flag is stored on the message object (`isRefusal: boolean`) to avoid re-evaluating in render.

**Rationale**: Centralising detection at message-creation time (in the `submit` handler) rather than in the render function prevents repeated computation and makes the flag part of the message record, consistent with the `Message` entity in the spec.

---

## Decision 6: Empty-input guard

**Decision**: The `submit` handler checks `input.trim() === ''` and returns early without sending a request or adding a bubble.

**Rationale**: FR-016 requires this. No user-visible error state is needed for empty input — silent no-op is sufficient.

---

## Decision 7: Error handling shape

**Decision**: On a non-OK HTTP response or `fetch` rejection, set `error` to a human-readable message string and push a bot bubble with `isError: true` and the same fallback text. The error bar is rendered above the message list and auto-dismisses on the next successful send.

**Rationale**: Two-channel error surfacing (bar + bubble) matches FR-008 and ensures the error is visible even if the user has scrolled up. Auto-dismiss on next send prevents stale errors from confusing the patient.

---

## Decision 8: Color palette application

| Token | Hex | Used on |
|---|---|---|
| navy | `#1a3a5c` | Header background, Send button background, citation filename text |
| teal | `#0891b2` | Send button hover, suggested-question button border |
| bg | `#f0f4f8` | Page background, user bubble background |
| white | `#ffffff` | Bot bubble background, input bar background |
| amber | `#f59e0b` | Refusal badge background |
| amber-text | `#92400e` | Refusal badge text (accessible contrast on amber bg) |
| error-red | `#dc2626` | Error bar background |
| error-text | `#fff` | Error bar text |

---

## Resolution summary

All unknowns resolved. No `NEEDS CLARIFICATION` items remain. Ready for Phase 1.
