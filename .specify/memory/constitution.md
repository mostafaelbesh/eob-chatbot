<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
Added sections: Core Principles (§1–§6), Code Standards, Technology Stack, Governance
Removed sections: N/A (initial constitution)
Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check gate is dynamic; no changes required
  ✅ .specify/templates/spec-template.md — No constitution references; no changes required
  ✅ .specify/templates/tasks-template.md — No constitution references; no changes required
Follow-up TODOs: none
-->

# EOB Chatbot Constitution

## Core Principles

### §1 Grounding-Only

Every answer MUST be derived exclusively from document excerpts retrieved from
the vector store. Outside knowledge, assumptions, or model priors MUST NOT
influence any response.

If the retrieved context does not contain sufficient information to answer the
question, the system MUST refuse rather than speculate.

**Rationale**: Patients rely on this system for accurate interpretation of their
insurance documents. Hallucinated figures or invented policy details create
direct financial and medical harm.

### §2 Citations-Mandatory

Every answer that retrieves relevant content MUST end with a Source line
identifying the document filename and the specific field cited. The `citations`
array MUST always be present in the API response object, even when empty.

Omitting citations is equivalent to an incorrect answer.

**Rationale**: Traceability to source documents enables patients and
administrators to verify every claim and builds auditable trust.

### §3 Fail-Closed

When no retrieved chunk exceeds `MIN_SCORE=0.10` and no keyword supplement
match is found, the system MUST return exactly:

> "I can't find that in your documents."

No partial answers, hedged guesses, or fallback generalizations are permitted.

**Rationale**: A confident wrong answer is more dangerous than a clear refusal.
Fail-closed behaviour prevents silent misinformation.

### §4 Exact-Figure Fidelity

All monetary amounts, reference numbers, phone numbers, and dates MUST be
returned verbatim from the source document. Rounding, conversion, abbreviation,
or reformatting is prohibited.

**Rationale**: A single transposed digit in a claim number or a rounded dollar
amount can invalidate a patient's dispute or payment.

### §5 Privacy Boundary

Patient documents MUST be embedded locally using `Xenova/all-MiniLM-L6-v2`
(quantized, cached in `.xenova-cache/`). No personally identifiable health
information (PHI) may be sent to external embedding services.

Only anonymised document excerpts (chunks without patient name, member ID, or
SSN context) may be transmitted to Anthropic for answer generation.

**Rationale**: Insurance EOB documents contain protected health information
under HIPAA. Externalising raw embeddings would constitute a data breach.

### §6 No-Advice

The system MUST describe only what the retrieved documents say. It MUST NOT
advise on payment strategies, dispute procedures, appeals processes, or any
medical decisions.

**Rationale**: This system is not a licensed financial or medical advisor.
Providing actionable advice exposes patients to harm and the operator to
liability.

## Code Standards

All source files MUST comply with the following non-negotiable coding rules:

- No JSDoc blocks in any source file.
- No section-banner comments (e.g., `// ── Section ──`).
- No standalone inline explanatory comments that restate what the code does.
- Server request-path I/O MUST be async only; `readFileSync` and
  `writeFileSync` are forbidden in `vectorStore.js` and any module imported on
  the hot path.
- CORS MUST be restricted to origins listed in the `ALLOWED_ORIGINS` environment
  variable (default: `http://localhost:5173`). Wildcard origins are forbidden.
- HTTP error responses MUST never include stack traces, internal file paths, or
  dependency version strings.
- All inputs at every API boundary MUST be validated before any processing
  occurs.

## Technology Stack

The following stack is authoritative. Deviations require a constitution
amendment.

| Layer | Technology |
|---|---|
| Runtime | Node 20 |
| API server | Express 4 |
| LLM | `@anthropic-ai/sdk` · model `claude-sonnet-4-6` |
| Embeddings | `@xenova/transformers` · `Xenova/all-MiniLM-L6-v2` quantized (local) |
| PDF extraction | `pdf-parse` (optional) |
| Vector store | `vector_store.json` flat JSON array on disk |
| Frontend | React 18, Vite 5 |
| Embedding cache | `.xenova-cache/` (local, not committed) |

## Governance

This constitution supersedes all other practices, README guidance, and inline
comments when conflicts arise.

**Amendment procedure**:
1. Open a PR with the proposed change to `.specify/memory/constitution.md`.
2. Increment `CONSTITUTION_VERSION` following semantic versioning:
   - MAJOR: principle removal, redefinition, or backward-incompatible
     governance change.
   - MINOR: new principle, new mandatory section, or material expansion.
   - PATCH: clarification, wording fix, or non-semantic refinement.
3. Update `LAST_AMENDED_DATE` to the merge date.
4. The PR description MUST include a Sync Impact Report listing all affected
   template and source files.
5. All six principles (§1–§6) require unanimous maintainer approval to amend.

**Compliance review**: Every PR that touches `src/query.js`, `src/llm.js`,
`src/vectorStore.js`, or `src/embedder.js` MUST verify compliance with §1–§6
before merge.

**Version**: 1.0.0 | **Ratified**: 2026-05-25 | **Last Amended**: 2026-05-25
