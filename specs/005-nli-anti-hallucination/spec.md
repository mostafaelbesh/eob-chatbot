# Feature Specification: NLI-based Anti-Hallucination Layer

**Feature Branch**: `005-nli-anti-hallucination`

**Created**: 2026-05-29

**Status**: Draft

---

## User Scenarios & Testing

### User Story 1 — Confident answers display a "Verified" badge (Priority: P1)

A patient asks a question whose answer is well-supported by their uploaded EOB documents. The system retrieves relevant chunks, generates an answer, and the NLI model confirms the answer is entailed by the retrieved excerpts. The user sees a green "Verified against your documents" badge beneath the answer, giving them confidence that the response is grounded.

**Why this priority**: Directly addresses the core trust problem. An unverified LLM answer and a verified one look identical without this badge; P1 because it is the primary user-visible deliverable of the feature.

**Independent Test**: Ask `"What is my deductible?"` against a loaded EOB document. Observe that `faithfulnessScore >= 0.8` in the API response and the green badge appears in the UI.

**Acceptance Scenarios**:

1. **Given** a question whose answer is grounded in a retrieved chunk, **When** the NLI `faithfulnessScore >= 0.8`, **Then** the API response includes `faithfulnessScore` as a number between 0 and 1, and the React UI renders a green "Verified against your documents" badge beneath the answer text.
2. **Given** a verified answer message in the UI, **When** the badge is rendered, **Then** it has a green background (`#16a34a`), white text, pill shape, and the exact label `"Verified against your documents"`.
3. **Given** a `faithfulnessScore` of exactly `0.8`, **When** the response is rendered, **Then** the badge is shown (boundary condition: `>= 0.8` is inclusive).

---

### User Story 2 — Hallucinated answers are suppressed via fail-closed (Priority: P1)

The LLM generates an answer that is not well-supported by the retrieved document excerpts (faithfulness score below the fail-closed threshold). The NLI check intercepts the answer and the system returns `"I can't find that in your documents."` instead of the unsupported claim.

**Why this priority**: This is the safety-critical behaviour. Showing an ungrounded answer is worse than showing no answer. P1 equal weight to Story 1.

**Independent Test**: Inject a mocked LLM response containing a fabricated dollar amount into `checkFaithfulness` against unrelated chunks. Confirm `passed: false` is returned and the pipeline returns `FAIL_CLOSED`.

**Acceptance Scenarios**:

1. **Given** the LLM returns an answer with `faithfulnessScore < 0.5`, **When** `checkFaithfulness` runs, **Then** `passed` is `false` and `queryPipeline` returns `{ answer: "I can't find that in your documents.", citations: [] }`.
2. **Given** the fail-closed NLI path triggers, **When** the API response is sent, **Then** `faithfulnessScore` is absent from the response body (not `null`, not `0` — simply omitted).
3. **Given** the fail-closed NLI path triggers, **When** the UI renders the message, **Then** the amber "No matching records found" badge appears (existing refusal behaviour), not the green "Verified" badge.

---

### User Story 3 — Low-confidence answers are returned without a badge (Priority: P2)

The NLI check passes (score >= 0.5) but the score is below the badge threshold (< 0.8). The answer is returned to the user with citations but without the "Verified" badge — the user can still read the answer but does not receive the visual confidence signal.

**Why this priority**: Prevents false confidence for ambiguous cases while still providing useful information.

**Independent Test**: Craft a question whose best-matching chunk only weakly supports the answer. Observe `faithfulnessScore` between 0.5 and 0.79 in the API response; confirm no badge in UI.

**Acceptance Scenarios**:

1. **Given** `faithfulnessScore` is between 0.5 (inclusive) and 0.8 (exclusive), **When** the UI renders the bot message, **Then** no badge of any colour is shown.
2. **Given** `faithfulnessScore` is exactly `0.79`, **When** the response is rendered, **Then** the badge is absent (boundary condition: `< 0.8` does not trigger badge).
3. **Given** a mid-confidence answer, **When** the API response is received, **Then** `citations` is non-empty and the answer text is unchanged.

---

### User Story 4 — Existing fail-closed paths are unaffected (Priority: P2)

Questions with no matching chunks, or where the LLM itself returns the fail-closed string, continue to be handled by the existing FAIL_CLOSED guards before reaching the NLI check. No regression in pre-existing behaviour.

**Why this priority**: Preserves §3 Fail-Closed guarantee; the NLI layer must not create a new path that bypasses the existing guards.

**Independent Test**: Run the existing `test-gold.js` gold row for `"xyzzy plugh zorkmid"` after the feature is implemented. It must still pass without modification.

**Acceptance Scenarios**:

1. **Given** a question with no matching vector or keyword chunks, **When** `queryPipeline` runs, **Then** `FAIL_CLOSED` is returned before `checkFaithfulness` is ever called.
2. **Given** the LLM itself returns `"I can't find that in your documents."`, **When** `queryPipeline` runs, **Then** the response is returned immediately without calling `checkFaithfulness`.
3. **Given** the `test-gold.js` suite, **When** run against a server with the feature deployed, **Then** all pre-existing assertions continue to pass.

---

### User Story 5 — NLI model loads lazily without blocking server startup (Priority: P3)

The `Xenova/nli-deberta-v3-small` model is not loaded until the first request that reaches the NLI check. Server startup time is unchanged.

**Why this priority**: DX and ops quality. A multi-second blocking load at startup would break `npm start` responsiveness.

**Independent Test**: Start the server with `npm start` and immediately call `GET /api/health`. The health endpoint must respond in under 500 ms regardless of NLI model cache state.

**Acceptance Scenarios**:

1. **Given** a cold server with no `.xenova-cache/` entry for the NLI model, **When** `npm start` runs, **Then** the server is ready (health endpoint responds 200) before the model is downloaded.
2. **Given** the NLI model is not yet loaded, **When** the first `POST /api/query` arrives, **Then** the request succeeds (model downloads/loads inline); subsequent requests use the cached singleton.
3. **Given** a warm cache (model already in `.xenova-cache/`), **When** the first NLI check runs after server restart, **Then** model load completes in under 5 seconds.

---

## Edge Cases

- **What happens when chunks array is empty before NLI check?** — Cannot occur; `checkFaithfulness` is only called after the `chunks.length === 0` guard in `queryPipeline`. Defensive: if called with an empty array, `Math.max(...[])` returns `-Infinity`, which is `< NLI_FAIL_THRESHOLD`, so the function returns `{ score: 0, passed: false }`.

- **What happens when the answer is very long?** — `answer.slice(0, 256)` truncates the answer before embedding it in the NLI hypothesis template, keeping the concatenated input within DeBERTa's ~512-token limit.

- **What happens if the NLI pipeline throws?** — An unhandled rejection propagates up through `queryPipeline` and is caught by Express error middleware. The HTTP client receives a 500. Stack trace is not exposed (existing error middleware guarantee). No special NLI-specific try/catch is added; this is consistent with how embedding errors are handled.

- **What happens when `faithfulnessScore` is exactly on the boundary (0.5 or 0.8)?** — `0.5` is the fail-closed threshold (`>= 0.5` passes). `0.8` is the badge threshold (`>= 0.8` shows badge). Both boundaries are inclusive.

- **What happens if `data.faithfulnessScore` is absent in the React UI (legacy response or fail-closed)?** — `faithfulnessScore: data.faithfulnessScore ?? null` stores `null`; the badge condition `msg.faithfulnessScore != null && msg.faithfulnessScore >= 0.8` evaluates to false. No badge shown.

- **What happens on parallel concurrent requests during NLI cold start?** — Multiple requests may call `getNliPipeline()` concurrently before the first resolves. All `await pipeline(...)` calls run in parallel; the module-level `nliPipeline` variable is set by whichever resolves first. This is a benign race: at worst, two model loads happen simultaneously, both complete, and the last one wins. No data corruption.

- **Does the NLI check affect the `Source:` citation line in the answer?** — No. The NLI check runs post-generation and does not modify the answer string. The existing `Source:` requirement in the system prompt is unchanged.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
