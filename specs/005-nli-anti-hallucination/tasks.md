# Tasks: NLI-based Anti-Hallucination Layer

**Feature**: 005-nli-anti-hallucination  
**Plan**: specs/005-nli-anti-hallucination/plan.md  
**Spec**: specs/005-nli-anti-hallucination/spec.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5 map to spec.md)

---

## Phase 1: Foundational (Blocking Prerequisite)

**Purpose**: Create the NLI checker module. Every subsequent task depends on this export existing.

**⚠️ CRITICAL**: No user story work begins until T001 is complete.

- [X] T001 Create `src/nliChecker.js` — singleton NLI pipeline, `scoreChunk`, `checkFaithfulness`, threshold constants

  **Files**:
  - `src/nliChecker.js` — create

  **Acceptance Criteria**:
  - File begins with `'use strict';`
  - `env.cacheDir` is set to `.xenova-cache/` using `path.resolve(process.cwd(), '.xenova-cache')` (identical pattern to `src/embedder.js`)
  - Module-level `nliPipeline` variable initialised to `null`; assigned only inside the first `getNliPipeline()` call (lazy singleton)
  - `scoreChunk(classifier, answer, chunkText)` truncates answer to 256 chars, calls `classifier` with `candidate_labels: ['supported', 'not supported']` and `hypothesis_template` `The answer "${truncated}" is {} by this document excerpt.`, returns the `'supported'` score as a number
  - `checkFaithfulness(answer, chunks)` calls `getNliPipeline()`, runs all chunks concurrently via `Promise.all`, returns `{ score: Math.max(...scores), passed: score >= NLI_FAIL_THRESHOLD }` where an empty chunks array produces `{ score: 0, passed: false }`
  - `NLI_FAIL_THRESHOLD = 0.5` and `NLI_BADGE_THRESHOLD = 0.8` defined as named constants at top of file
  - `module.exports = { checkFaithfulness, NLI_BADGE_THRESHOLD }` — `NLI_FAIL_THRESHOLD` is not exported (internal only)
  - No JSDoc blocks, no section-banner comments, no standalone inline explanatory comments
  - `node -e "require('./src/nliChecker')"` exits 0 (syntax valid, no startup side-effects)

  **Depends on**: nothing

**Checkpoint**: `src/nliChecker.js` exports `{ checkFaithfulness, NLI_BADGE_THRESHOLD }` and passes a `node -e` syntax check.

---

## Phase 2: User Story 1 + User Story 2 — Query Pipeline Integration (Priority: P1) 🎯 MVP

**Goal**: Run the NLI faithfulness check after LLM generation. Suppress ungrounded answers (US2). Attach `faithfulnessScore` to grounded responses (US1). Leave pre-existing FAIL_CLOSED guards untouched (US4).

**Independent Test**: POST `{"question":"What is my deductible?"}` to `/api/query`; verify `faithfulnessScore` is a number 0–1 in the response body. POST a nonsense question; verify `faithfulnessScore` is absent from the response body.

- [X] T002 [US1] [US2] Integrate `checkFaithfulness` into `src/query.js` — post-LLM NLI check, FAIL_CLOSED on `passed: false`, `faithfulnessScore` in success response

  **Files**:
  - `src/query.js` — modify

  **Changes**:
  1. Add `const { checkFaithfulness, NLI_BADGE_THRESHOLD: _badge } = require('./nliChecker');` at the top alongside existing imports (the import makes `checkFaithfulness` available; `NLI_BADGE_THRESHOLD` is consumed by the UI, not `query.js`, so it need not be re-exported)
  2. After the `if (answer.trim() === FAIL_CLOSED)` guard (line ~58), call `checkFaithfulness(answer, chunks)` and handle the result:
     - If `passed` is `false` → return `{ answer: FAIL_CLOSED, citations: [] }` (no `faithfulnessScore` field)
     - If `passed` is `true` → return `{ answer, citations: [...], faithfulnessScore: score }`
  3. The two existing FAIL_CLOSED guards (`chunks.length === 0` and `answer.trim() === FAIL_CLOSED`) remain intact and are reached before `checkFaithfulness` is called

  **Acceptance Criteria**:
  - `POST /api/query` with a question that retrieves chunks and gets a grounded LLM answer returns a response body containing `faithfulnessScore` as a `number` between 0 and 1 (inclusive)
  - `POST /api/query` with a question that triggers the `chunks.length === 0` guard returns `{ answer: "I can't find that in your documents.", citations: [] }` with no `faithfulnessScore` field — `checkFaithfulness` is never called on this path
  - `POST /api/query` with a question where the NLI check produces `passed: false` returns `{ answer: "I can't find that in your documents.", citations: [] }` with no `faithfulnessScore` field
  - `POST /api/query` with a question where the NLI check produces `passed: true` and `score >= 0.8` returns `faithfulnessScore >= 0.8`
  - `POST /api/query` with a question where the NLI check produces `passed: true` and `0.5 <= score < 0.8` returns `faithfulnessScore` between 0.5 and 0.8 and `citations` is non-empty
  - No stack traces appear in any error response body
  - No JSDoc blocks, no section-banner comments, no standalone inline explanatory comments added

  **Depends on**: T001

**Checkpoint**: `/api/query` returns `faithfulnessScore` on grounded answers and returns FAIL_CLOSED (without `faithfulnessScore`) on ungrounded answers.

---

## Phase 3: User Story 1 — Verified Badge in React UI (Priority: P1)

**Goal**: Store `faithfulnessScore` per bot message. Render a green "Verified against your documents" pill badge on messages where `faithfulnessScore >= 0.8`. No badge for mid-confidence (`>= 0.5, < 0.8`) or fail-closed (`faithfulnessScore` absent / `null`) messages.

**Independent Test**: Manually set a bot message's `faithfulnessScore` to `0.9` in state — badge renders. Set to `0.79` — no badge. Set to `null` — no badge. Confirm amber "No matching records found" badge still appears on refusal messages.

- [X] T003 [P] [US1] Update `client/src/App.jsx` — store `faithfulnessScore` per bot message and render green "Verified against your documents" badge when `faithfulnessScore >= 0.8`

  **Files**:
  - `client/src/App.jsx` — modify

  **Changes**:
  1. In the `submit` function, when building the bot message object after a successful fetch, add `faithfulnessScore: data.faithfulnessScore ?? null` alongside the existing fields
  2. In the error-fallback message object, add `faithfulnessScore: null`
  3. In the message render block (after the amber refusal badge and before the closing `</div>`), add a conditional block: when `msg.role === 'bot'` and `msg.faithfulnessScore != null` and `msg.faithfulnessScore >= 0.8`, render a `<div>` badge with:
     - `backgroundColor: '#16a34a'`
     - `color: '#ffffff'`
     - `borderRadius: '9999px'`
     - `fontSize: '0.75rem'`
     - `fontWeight: 600`
     - `display: 'inline-block'`
     - `marginTop: '0.625rem'`
     - `padding: '0.25rem 0.75rem'`
     - Label text: `Verified against your documents`

  **Acceptance Criteria**:
  - A bot message with `faithfulnessScore: 0.9` renders the green badge with exact label `"Verified against your documents"` and `backgroundColor: '#16a34a'`
  - A bot message with `faithfulnessScore: 0.8` renders the badge (boundary: `>= 0.8` is inclusive)
  - A bot message with `faithfulnessScore: 0.79` does not render the green badge
  - A bot message with `faithfulnessScore: null` (fail-closed or error) does not render the green badge
  - A refusal message (`isRefusal: true`) still renders the amber "No matching records found" badge unchanged
  - An error message (`isError: true`) does not render either badge
  - The existing citations block, source display, and refusal badge are visually unchanged
  - No JSDoc blocks, no section-banner comments, no standalone inline explanatory comments added

  **Depends on**: T002 (defines the `faithfulnessScore` field shape)

**Checkpoint**: Green "Verified against your documents" badge appears on `faithfulnessScore >= 0.8` bot messages; amber badge still appears on refusals; no badge on mid-confidence or fail-closed messages.

---

## Phase 4: User Story 3 + User Story 4 — Gold-Row Test Extensions (Priority: P2)

**Goal**: Assert `faithfulnessScore` presence and shape on matching queries. Assert that FAIL_CLOSED path returns no score. Confirm all six pre-existing assertions still pass unchanged.

**Independent Test**: `node test-gold.js` exits with code 0 against a running server with the feature deployed.

- [X] T004 [P] [US3] [US4] Extend `test-gold.js` — add `faithfulnessScore` assertions for grounded-query and FAIL_CLOSED paths; preserve all existing assertions

  **Files**:
  - `test-gold.js` — modify

  **Changes**:
  1. In the existing assertion for `'POST /api/query with matching question'` (question: `'What is a deductible?'`), add `typeof body.faithfulnessScore === 'number' && body.faithfulnessScore >= 0 && body.faithfulnessScore <= 1` to the condition
  2. In the existing assertion for `'POST /api/query with no-match question'` (question: `'xyzzy plugh zorkmid'`), add `body.faithfulnessScore === undefined` to the condition (field must be absent, not `null` or `0`)

  **Acceptance Criteria**:
  - Running `node test-gold.js` against the feature-deployed server prints `PASS` for all assertions and exits with code 0
  - The `'matching question'` assertion verifies `body.faithfulnessScore` is a `number`, `>= 0`, and `<= 1`
  - The `'no-match question'` assertion verifies `body.faithfulnessScore` is `undefined` (field absent from response body)
  - All six original assertions (`/api/health`, matching question, no-match question, missing question 400, empty question 400, non-string question 400) remain present and unmodified except for the two additions above
  - No JSDoc blocks, no standalone inline explanatory comments added

  **Depends on**: T002 (server must return `faithfulnessScore` for assertions to pass)

**Checkpoint**: `node test-gold.js` exits 0; two assertions now verify `faithfulnessScore`; no existing assertions removed or weakened.

---

## Phase 5: Manual Verification Checklist (Polish)

**Purpose**: End-to-end confirmation that all observable behaviours are correct on a running system before the feature branch is merged.

- [ ] T005 Complete manual smoke-test checklist — verify badge, fail-closed, mid-confidence, and `test-gold.js` end-to-end

  **Files**: none (verification only)

  **Checklist**:

  - [ ] Run `npm start` — server starts; `GET http://localhost:3001/api/health` returns `200 { status: 'ok' }` within 2 seconds (NLI model not yet loaded)
  - [ ] Run `node test-gold.js` — all assertions print `PASS`; process exits 0
  - [ ] Open the React UI (`npm run dev:client`); ask `"What is my deductible?"` — response appears with green "Verified against your documents" badge; amber badge absent
  - [ ] In the React UI, ask `"xyzzy plugh zorkmid"` — response shows `"I can't find that in your documents."`; amber "No matching records found" badge appears; green badge absent
  - [ ] Inspect the `/api/query` response for the grounded question via browser DevTools Network tab — confirm `faithfulnessScore` is present and between 0 and 1
  - [ ] Inspect the `/api/query` response for the nonsense question — confirm `faithfulnessScore` is absent from the response body
  - [ ] Ask a question expected to produce a mid-confidence score (if achievable with the loaded EOB document) — confirm answer is returned, citations are non-empty, no green badge visible
  - [ ] Verify `.xenova-cache/` contains a subdirectory for `nli-deberta-v3-small` after the first NLI-checked request

  **Depends on**: T001, T002, T003, T004

---

## Dependencies

```
T001 → T002 → T003
                └─→ T004 → T005
       T002   → T004
```

T003 and T004 are independent of each other and can be worked in parallel after T002 completes.

## Parallel Execution

| After        | Can start in parallel |
|--------------|-----------------------|
| T001         | T002 only             |
| T002         | T003 and T004         |
| T003 + T004  | T005                  |

## Implementation Strategy

**MVP** (T001 + T002 + T003): Server suppresses hallucinations and UI displays the verified badge. Shippable for internal review.  
**Complete** (T004 + T005): Test suite extended, feature smoke-tested, ready to merge.

## Task Count

| Phase | Tasks | User Stories |
|-------|-------|--------------|
| Foundational | 1 (T001) | — |
| Query pipeline | 1 (T002) | US1, US2 |
| React UI | 1 (T003) | US1 |
| Test extensions | 1 (T004) | US3, US4 |
| Manual checklist | 1 (T005) | US1–US5 |
| **Total** | **5** | |
