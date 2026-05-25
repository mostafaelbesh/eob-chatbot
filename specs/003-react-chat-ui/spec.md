# Feature Specification: React Chat UI

**Feature Branch**: `003-react-chat-ui`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "React 18 + Vite 5 single-page chat UI in the client/ subdirectory."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit and Receive Messages (Priority: P1)

A patient opens the chat interface and types a question about their EOB document. They press Enter or click the Send button. Their message immediately appears on screen as a right-aligned bubble while a typing indicator confirms the request is in flight. The input and Send button are disabled so they cannot send a duplicate. When the server responds, the answer appears as a left-aligned bubble. If the server returns an HTTP error, an error bar is shown above the message list and a fallback error message appears in the bot bubble.

**Why this priority**: Core interaction loop — without this, the chat is non-functional. All other user stories depend on a working send-and-receive cycle.

**Independent Test**: Can be fully tested by submitting a question and observing the UI states (loading, success, error) without needing citations, refusal detection, or suggested questions to be present.

**Acceptance Scenarios**:

1. **Given** the chat is in idle state, **When** the user types a message and presses Enter (without Shift), **Then** the message appears as a right-aligned bubble and the input + Send button become disabled.
2. **Given** a request is in flight, **When** the server responds successfully, **Then** a typing indicator disappears, the input and Send button re-enable, and the bot answer appears as a left-aligned bubble.
3. **Given** a request is in flight, **When** the server returns an HTTP error (4xx or 5xx), **Then** an error bar appears above the message area and the bot bubble shows a human-readable fallback error text.
4. **Given** the user is typing, **When** they press Shift+Enter, **Then** a newline is inserted in the textarea and no message is submitted.
5. **Given** a request is in flight, **When** the user attempts to type or click Send, **Then** the input and button remain disabled and no duplicate request is sent.

---

### User Story 2 - Citations Display (Priority: P2)

After the bot answers, the patient wants to know which part of their document the answer came from. If the server response includes a citations array with one or more entries, a citations block is rendered below the answer text showing the source filename and the relevant excerpt for each entry. If the array is empty or absent, nothing is rendered.

**Why this priority**: Grounding is a core product requirement (§1, §2). Without visible citations, patients cannot verify answers against their documents.

**Independent Test**: Can be tested independently by mocking a server response that includes a non-empty citations array and confirming the block renders, then verifying it is absent when the array is empty or missing.

**Acceptance Scenarios**:

1. **Given** the server response includes a citations array with two entries, **When** the bot bubble is rendered, **Then** a citations block appears below the answer with the source filename and excerpt for each entry.
2. **Given** the server response includes an empty citations array, **When** the bot bubble is rendered, **Then** no citations block is rendered.
3. **Given** the server response omits the citations field entirely, **When** the bot bubble is rendered, **Then** no citations block is rendered.

---

### User Story 3 - Refusal Badge (Priority: P3)

When the bot is unable to find a relevant answer in the patient's documents, it returns a well-known refusal phrase. The UI should signal this clearly: a yellow/amber badge replaces the citations block so the patient immediately understands the system has no grounded answer — rather than silently showing no citations.

**Why this priority**: Distinguishes a genuine "no data found" state from a normal answer with no citations, preventing patient confusion. Builds on the answer-display functionality of US1.

**Independent Test**: Can be tested independently by mocking a response whose answer text contains a refusal phrase and confirming the yellow/amber badge appears where the citation block would otherwise be.

**Acceptance Scenarios**:

1. **Given** the bot answer contains the phrase "can't find", **When** the bot bubble is rendered, **Then** a yellow/amber badge is displayed instead of any citation block.
2. **Given** the bot answer contains "cannot find", "not found", or "not in your documents", **When** the bot bubble is rendered, **Then** the yellow/amber badge is displayed.
3. **Given** the bot answer does not match any refusal phrase and the citations array is non-empty, **When** the bot bubble is rendered, **Then** the normal citation block is shown and no badge is displayed.
4. **Given** the bot answer does not match any refusal phrase and the citations array is empty, **When** the bot bubble is rendered, **Then** neither the badge nor the citation block is displayed.

---

### User Story 4 - Suggested Questions Empty State (Priority: P4)

When the chat has no messages yet, four pre-set question buttons are displayed to help the patient get started. Clicking any button submits it immediately as if the patient had typed and sent it. Once the first message has been sent, the buttons are no longer shown.

**Why this priority**: Reduces friction for first-time users who may not know what to ask. Pure progressive-disclosure feature built on top of the working message flow.

**Independent Test**: Can be tested independently by verifying the four buttons appear before any messages are sent, that clicking one triggers a submit, and that after the first message all four buttons are gone.

**Acceptance Scenarios**:

1. **Given** the chat has no messages, **When** the page loads, **Then** four suggested-question buttons are visible with the specified labels.
2. **Given** the chat has no messages, **When** the user clicks a suggested-question button, **Then** that question is submitted immediately (same behavior as typing and pressing Enter) and the buttons disappear.
3. **Given** at least one message has been sent or received, **When** the message list is visible, **Then** none of the four suggested-question buttons are shown.

---

### Edge Cases

- What happens when the server response takes longer than expected (slow network)? The typing indicator must remain visible and the input must stay disabled for the full duration.
- What happens if the user submits an empty message (whitespace only)? The submit action must be a no-op; no request is sent and no bubble is added.
- What happens if the server returns a malformed JSON body? The error handling path (error bar + fallback bot bubble) must trigger.
- What happens on very long bot answers? The bubble must scroll within the message list without breaking the layout.
- What happens if a citation excerpt is extremely long? The excerpt should truncate or wrap gracefully without overflowing its container.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat UI MUST render as a single page contained within the `client/` subdirectory and served via the existing Vite 5 dev server and build pipeline.
- **FR-002**: The message input MUST submit on Enter keypress and MUST insert a newline on Shift+Enter without submitting.
- **FR-003**: The message input and Send button MUST be disabled while a request is in flight.
- **FR-004**: User messages MUST appear immediately as right-aligned bubbles upon submission, before the server responds.
- **FR-005**: A typing indicator MUST be visible while the request is in flight and MUST disappear when the response arrives.
- **FR-006**: Bot answers MUST appear as left-aligned bubbles after the server responds.
- **FR-007**: The UI MUST send the question to `POST /api/query` at the relative path `/api/query` and read `answer` and `citations` from the JSON response body.
- **FR-008**: On any HTTP error or network failure, an error bar MUST appear in the message area and the bot bubble MUST display a human-readable fallback error message.
- **FR-009**: When the response includes a non-empty `citations` array and the answer does not match a refusal phrase, a citations block MUST render below the bot answer showing source filename and excerpt for each entry.
- **FR-010**: When the `citations` array is empty or absent, no citation block MUST be rendered.
- **FR-011**: When the bot answer text matches any of the following patterns (case-insensitive): "can't find", "cannot find", "not found", "not in your documents" — a yellow/amber badge MUST be displayed in place of the citation block.
- **FR-012**: When the chat has no messages, four suggested-question buttons MUST be displayed with these exact labels:
  - "The provider billed me $160 -- do I owe it?"
  - "The doctor is threatening collections -- am I protected?"
  - "How close am I to my in-network deductible?"
  - "What is my dental copay?"
- **FR-013**: Clicking a suggested-question button MUST submit that question immediately and the buttons MUST NOT appear after the first message has been sent or received.
- **FR-014**: All styling MUST use inline styles only; no CSS framework, external stylesheet, or CSS-in-JS library may be used.
- **FR-015**: Source code MUST contain no JSDoc blocks, no section-banner comments, and no emoji characters.
- **FR-016**: Empty or whitespace-only input MUST NOT be submitted.

### Key Entities

- **Message**: Represents a single chat turn; has a role (`user` or `bot`), text content, and optionally an `isError` flag; bot messages additionally carry `citations` and `isRefusal` flags.
- **Citation**: A single grounding reference returned by the server; has a `filename` and an `excerpt` string.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can type a question and receive an answer within the normal server response time — the UI introduces no perceptible additional delay beyond network round-trip.
- **SC-002**: The chat correctly handles the full message lifecycle (idle → loading → answer) with zero dropped states across 10 sequential sends in manual testing.
- **SC-003**: The error bar and fallback bot bubble appear on every simulated HTTP 500 response, with a 100% reproduction rate.
- **SC-004**: Citation blocks render correctly for responses with 1, 2, and 5 citations; no citation block appears for responses with 0 citations or no citations field.
- **SC-005**: The refusal badge renders for all four specified trigger phrases and is absent for normal answers, verified across at least 8 test cases (4 positive, 4 negative).
- **SC-006**: All four suggested questions are visible on first load and are completely absent after the first message is sent, confirmed in a fresh browser session.
- **SC-007**: Shift+Enter inserts a newline without submitting; plain Enter submits without inserting a newline — both verified via interaction test.

## Assumptions

- The `client/` subdirectory already contains a Vite 5 + React 18 scaffold that proxies `/api` to the Express server on port 3001.
- The existing `POST /api/query` endpoint returns JSON with at minimum `{ answer: string, citations: Array }`.
- No authentication or session management is required for the chat UI.
- Mobile/responsive layout is out of scope for this iteration; a fixed-width desktop layout is acceptable.
- Accessibility (ARIA roles, keyboard navigation beyond Enter/Shift+Enter) is a stretch goal and not a hard requirement for this spec.
- The Vite dev server is already configured; no changes to `vite.config.js` are required unless the proxy is missing.
