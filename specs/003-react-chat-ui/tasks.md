---

description: "Task list template for feature implementation"
---

# Tasks: React Chat UI

**Input**: Design documents from `/specs/003-react-chat-ui/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-contracts.md](contracts/ui-contracts.md)

**Source files**:
- `client/package.json` — NEW
- `client/vite.config.js` — NEW
- `client/index.html` — NEW
- `client/src/main.jsx` — NEW
- `client/src/App.jsx` — NEW

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (different files, no dependencies on in-progress tasks)
- **[US#]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: Create the five client/ scaffold files and install dependencies. Tasks T002–T004 touch different files and can be authored in parallel with T001.

- [x] T001 Create `client/package.json` — set `"type": "module"`, `"scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" }`, `"dependencies": { "react": "^18", "react-dom": "^18" }`, `"devDependencies": { "vite": "^5", "@vitejs/plugin-react": "^4" }`
- [x] T002 [P] Create `client/vite.config.js` — `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'`; export `defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } } } })`
- [x] T003 [P] Create `client/index.html` — standard HTML5 boilerplate; `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, `<title>EOB Chatbot</title>`, `<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>`
- [x] T004 [P] Create `client/src/main.jsx` — `import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App.jsx';` then `ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)`

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Create the `App.jsx` shell with all state declarations, the two module-level constants, the outer layout structure, and the scroll anchor — the skeleton that every user story phase fills in.

**⚠️ CRITICAL**: No user story work can begin until T005 is complete.

- [x] T005 Create `client/src/App.jsx` shell — declare `const REFUSAL_RE = /can't find|cannot find|not found|not in your documents/i` and `const SUGGESTED_QUESTIONS = [...]` (four exact labels from FR-012) at module level; inside `export default function App()` declare `const [messages, setMessages] = React.useState([])`, `const [input, setInput] = React.useState('')`, `const [loading, setLoading] = React.useState(false)`, `const [error, setError] = React.useState(null)`, `const bottomRef = React.useRef(null)`; return a full-height flex-column div (bg `#f0f4f8`) containing: a header bar (bg `#1a3a5c`, white text, `padding: '1rem'`, `fontSize: '1.1rem'`), a flex-grow message list div (overflow-y auto, padding `1rem`), and a white input bar row at the bottom — all wired up as empty placeholders that subsequent tasks fill in; add `useEffect` scroll hook: `React.useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])`

**Checkpoint**: `npm install` inside `client/`, then `npm run dev` should start Vite on port 5173 and render the header + empty layout with no console errors.

---

## Phase 3: User Story 1 — Submit and Receive (Priority: P1) 🎯 MVP

**Goal**: A user can type a question, submit it (Enter or Send), see their message immediately as a right-aligned bubble, see a typing indicator while waiting, and see the bot's answer as a left-aligned bubble. HTTP errors produce an error bar and a fallback bot bubble.

**Independent Test**: Start Express (`npm start` from project root) and Vite (`npm run dev:client`). Open `http://localhost:5173`. Type any question and press Enter — user bubble appears instantly, typing indicator appears, bot bubble arrives after response. Stop Express, send another question — red error bar appears and a bot bubble with fallback error text appears.

- [x] T006 [US1] Implement `async function submit(text)` inside `client/src/App.jsx` — guard: if `(text ?? input).trim() === ''` return early (FR-016); capture `question = (text ?? input).trim()`; clear `error` to null; push user bubble `{ id: crypto.randomUUID(), role: 'user', text: question }` via `setMessages(prev => [...prev, userMsg])`; `setInput('')`; `setLoading(true)`; inside `try`: `const res = await fetch('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })`; if `!res.ok` throw `new Error('Server returned ' + res.status)`; `const data = await res.json()`; compute `isRefusal = REFUSAL_RE.test(data.answer ?? '')`; push bot bubble `{ id: crypto.randomUUID(), role: 'bot', text: data.answer, citations: data.citations ?? [], isRefusal, isError: false }`; in `catch(err)`: `setError('Could not reach the server. Please try again.')`; push bot bubble `{ id: crypto.randomUUID(), role: 'bot', text: 'Sorry, something went wrong. Please try again.', citations: [], isRefusal: false, isError: true }`; in `finally`: `setLoading(false)`
- [x] T007 [US1] Implement message bubble rendering in the message-list div of `client/src/App.jsx` — `messages.map(msg => <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '0.75rem' }}>` containing an inner bubble div with: `maxWidth: '72%'`, `padding: '0.75rem 1rem'`, `borderRadius: '1rem'`, `backgroundColor: msg.role === 'user' ? '#f0f4f8' : '#ffffff'`, `border: msg.role === 'user' ? '1px solid #cbd5e1' : '1px solid #e2e8f0'`, `color: msg.isError ? '#dc2626' : '#1e293b'`, `fontSize: '0.95rem'`, `lineHeight: '1.5'`; render `<p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>`; citation and badge slots left as `{null}` placeholders for US2/US3
- [x] T008 [US1] Implement typing indicator in `client/src/App.jsx` — add `const [dots, setDots] = React.useState(1)` state; add `React.useEffect(() => { if (!loading) return; const id = setInterval(() => setDots(d => d === 3 ? 1 : d + 1), 450); return () => clearInterval(id) }, [loading])`; render inside message-list when `loading === true`: same left-aligned bubble wrapper as bot bubbles containing `<span style={{ color: '#64748b', fontSize: '1.1rem', letterSpacing: '0.1em' }}>{'•'.repeat(dots)}</span>`
- [x] T009 [US1] Implement error bar and input bar in `client/src/App.jsx` — error bar: render `{error && <div style={{ backgroundColor: '#dc2626', color: '#ffffff', padding: '0.625rem 1rem', fontSize: '0.875rem' }}>{error}</div>}` between the header and message list; input bar: inside the bottom row div render `<textarea rows={1} value={input} disabled={loading} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} style={{ flex: 1, resize: 'none', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.625rem 0.75rem', fontSize: '0.95rem', outline: 'none', backgroundColor: loading ? '#f8fafc' : '#ffffff' }} placeholder="Ask about your EOB..." />`; `<button onClick={() => submit()} disabled={loading} style={{ marginLeft: '0.5rem', padding: '0.625rem 1.25rem', backgroundColor: loading ? '#94a3b8' : '#1a3a5c', color: '#ffffff', border: 'none', borderRadius: '0.5rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>Send</button>`

**Checkpoint**: Full message lifecycle works end-to-end. US1 independently verifiable per spec SC-001 through SC-003.

---

## Phase 4: User Story 2 — Citations Display (Priority: P2)

**Goal**: Bot bubbles that carry a non-empty `citations` array (and are not refusals) show a "Sources" block below the answer text listing each citation's filename and excerpt.

**Independent Test**: Send a question that returns citations from the live server. Confirm the sources block appears with filename and excerpt. Send a question that triggers the fail-closed refusal — no sources block appears (refusal badge will be added in US3; for now the slot is empty).

- [x] T010 [US2] Add citation block rendering inside each bot bubble in `client/src/App.jsx` — replace the `{null}` citation placeholder with: `{msg.role === 'bot' && !msg.isRefusal && msg.citations?.length > 0 && (<div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}><p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources</p>{msg.citations.map((c, i) => (<div key={i} style={{ marginBottom: '0.5rem' }}><p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', fontWeight: 600, color: '#1a3a5c' }}>{c.source ?? c.filename}</p><p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{c.excerpt}</p></div>))}</div>)}`

**Checkpoint**: SC-004 verifiable — citation block appears for 1/2/5 citations, absent for 0.

---

## Phase 5: User Story 3 — Refusal Badge (Priority: P3)

**Goal**: When the bot answer text matches the refusal regex, an amber badge is shown in place of the citation block.

**Independent Test**: Send the question "xyzzy plugh zorkmid" (or any nonsense guaranteed to miss) — confirm the amber badge appears below the bot answer text and no citation block is shown. Send a question with known citations — confirm the badge is absent and the citation block is shown instead.

- [x] T011 [US3] Add refusal badge rendering inside each bot bubble in `client/src/App.jsx` — replace the `{null}` badge placeholder with: `{msg.role === 'bot' && msg.isRefusal && (<div style={{ display: 'inline-block', marginTop: '0.625rem', padding: '0.25rem 0.75rem', backgroundColor: '#f59e0b', color: '#92400e', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>No matching records found</div>)}`; confirm the existing citations block condition already guards with `!msg.isRefusal` (added in T010) so the two are mutually exclusive

**Checkpoint**: SC-005 verifiable — badge present for all 4 refusal phrases, absent for normal answers.

---

## Phase 6: User Story 4 — Suggested Questions (Priority: P4)

**Goal**: Four pre-set question buttons are shown when the message list is empty. Clicking one submits the question immediately. The buttons disappear after the first message is sent.

**Independent Test**: Open a fresh browser tab at `http://localhost:5173` — four buttons with the exact specified labels are visible. Click one — it submits immediately (user bubble appears, typing indicator appears) and the buttons are gone. Reload the page — buttons are visible again.

- [x] T012 [US4] Add suggested questions section to `client/src/App.jsx` — render immediately above the input bar: `{messages.length === 0 && !loading && (<div style={{ padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>{SUGGESTED_QUESTIONS.map(q => (<button key={q} onClick={() => submit(q)} style={{ padding: '0.5rem 0.75rem', backgroundColor: '#ffffff', border: '1px solid #0891b2', borderRadius: '0.5rem', color: '#0f172a', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left', lineHeight: '1.4' }}>{q}</button>))}</div>)}`; verify `submit(q)` (text arg path added in T006) sets input and immediately fires the fetch without requiring a second interaction

**Checkpoint**: SC-006 verifiable — all four buttons appear on load, none appear after first send.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Wire the root npm scripts so the project can be started from the repo root, then run the full quickstart verification.

- [x] T013 [P] Verify/add `dev:client` and `build:client` scripts in root `package.json` — if `"dev:client"` is absent add `"dev:client": "cd client && npm run dev"`; if `"build:client"` is absent add `"build:client": "cd client && npm run build"`; ensure `npm run dev:client` from project root starts Vite on port 5173 and `npm run build:client` produces `client/dist/`
- [x] T014 Run `specs/003-react-chat-ui/quickstart.md` end-to-end verification — install `client/` deps (`cd client && npm install`), start Express (`npm start` in one terminal), start Vite (`npm run dev:client` in another), open `http://localhost:5173` and manually verify all 7 success criteria: SC-001 (no perceptible delay), SC-002 (10 sequential sends, no dropped states), SC-003 (error bar + fallback bubble on simulated 500), SC-004 (citation block for 1/2/5 citations, absent for 0), SC-005 (refusal badge for all 4 trigger phrases, absent for normal answers), SC-006 (4 buttons on load, gone after first send), SC-007 (Shift+Enter newline, Enter submits)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T002, T003, T004 are mutually independent [P] alongside T001
- **Foundational (Phase 2)**: Depends on Phase 1 complete (needs package.json for npm install; needs index.html + main.jsx to reference App.jsx)
- **Phase 3 (US1)**: Requires T005 (App.jsx shell) — BLOCKS all user story phases
- **Phase 4 (US2)**: Requires Phase 3 complete (citation slot exists in bubble render)
- **Phase 5 (US3)**: Requires Phase 3 complete (isRefusal flag set in submit handler); independent of Phase 4
- **Phase 6 (US4)**: Requires Phase 3 complete (submit handler accepts text arg); independent of Phases 4–5
- **Phase 7 (Polish)**: T013 can run any time after Phase 1; T014 requires all story phases complete

### User Story Dependencies

- **US1 (P1)**: Requires Foundational (T005) — no story dependencies
- **US2 (P2)**: Requires US1 complete — needs citation slot in bubble render
- **US3 (P3)**: Requires US1 complete — needs `isRefusal` flag from submit handler; independent of US2
- **US4 (P4)**: Requires US1 complete — needs `submit(text)` signature; independent of US2, US3

### Within Each User Story (App.jsx is a single file — sequential within story)

- T006 (submit handler) before T007 (bubble render) — render depends on message shape established in handler
- T007 (bubble render) before T008 (typing indicator) — indicator reuses bubble wrapper styles
- T008 (typing indicator) before T009 (input bar + error bar) — completes the full lifecycle before wiring inputs

### Parallel Opportunities

- T001–T004 (Phase 1): All four files are independent — author simultaneously
- T013 (root scripts): Independent of all client/ file tasks — can run any time
- US2, US3, US4 (Phases 4–6): All depend only on US1 completion; can be parallelised across team members by editing non-overlapping sections of App.jsx

---

## Parallel Example: User Story 1 (single-dev sequence)

```
T006 submit handler  →  T007 bubble render  →  T008 typing indicator  →  T009 input bar
```

## Parallel Example: US2 + US3 + US4 after US1 completes (multi-dev)

```
US1 complete (T009 done)
       │
       ├── Dev A: T010 [US2] citation block
       ├── Dev B: T011 [US3] refusal badge
       └── Dev C: T012 [US4] suggested questions
```

---

## Implementation Strategy

**MVP scope**: Complete Phase 1 + Phase 2 + Phase 3 (T001–T009). This delivers a fully functional chat with submit/receive, typing indicator, error handling, and disabled input state — sufficient to demonstrate the core product.

**Increment 2**: Add Phase 4 (T010) for citation display — required for grounding transparency (§2).

**Increment 3**: Add Phase 5 (T011) for refusal badge — improves fail-closed UX (§3).

**Increment 4**: Add Phase 6 (T012) for suggested questions — reduces first-time friction.

**Final**: Phase 7 (T013–T014) polish and verification.
