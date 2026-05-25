# Implementation Plan: Document Ingestion Pipeline

**Branch**: `001-ingestion-pipeline` | **Date**: 2026-05-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ingestion-pipeline/spec.md`

## Summary

One-shot CLI script (`npm run ingest`) that scans `./data/` for `.pdf` and `.txt` files, extracts text, splits into overlapping 300-character chunks (50-char overlap, minimum 20-char length), embeds each chunk locally using `Xenova/all-MiniLM-L6-v2` quantized via `@xenova/transformers`, and writes a flat JSON array to `vector_store.json`. Creates three source files: `src/ingest.js`, `src/embedder.js`, and `src/vectorStore.js`.

## Technical Context

**Language/Version**: Node 20, CommonJS (`require` / `module.exports`)

**Primary Dependencies**: `@xenova/transformers ^2.17.2`, `pdf-parse ^1.1.1` (optional at runtime), Node built-ins `fs`, `path`

**Storage**: `vector_store.json` — flat JSON array at project root; full overwrite on each ingest run

**Testing**: No test framework; integration-tested by running `npm run ingest` against `./data/` and inspecting `vector_store.json` (see [quickstart.md](quickstart.md))

**Target Platform**: Node 20 CLI process; cross-platform (Windows / Linux / macOS)

**Project Type**: CLI batch script

**Performance Goals**: ≤ 5 minutes for up to 10 MB of input documents (SC-001)

**Constraints**: Zero external network calls during embedding (§5 Privacy Boundary); `pdf-parse` treated as optional runtime dependency

**Scale/Scope**: Single-user admin operation; `./data/` folder up to ~10 MB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — all gates still pass.*

| Principle | Status | Notes |
|---|---|---|
| §1 Grounding-Only | N/A | Ingest pipeline does not generate answers |
| §2 Citations-Mandatory | N/A | Ingest pipeline does not generate answers |
| §3 Fail-Closed | N/A | Ingest pipeline does not generate answers |
| §4 Exact-Figure Fidelity | PASS | Text stored verbatim; no transformation or rounding applied |
| §5 Privacy Boundary | PASS | Embeddings computed locally via `Xenova/all-MiniLM-L6-v2`; `env.cacheDir` set to `.xenova-cache/`; no PHI sent externally |
| §6 No-Advice | N/A | Ingest pipeline does not generate answers |
| Code — No JSDoc | PASS | Enforced in implementation |
| Code — No section banners | PASS | Enforced in implementation |
| Code — Async I/O in `vectorStore.js` | PASS | `fs.promises` exclusively; `readFileSync`/`writeFileSync` forbidden in that module |
| Code — `readFileSync` in `ingest.js` | PASS | CLI is not on the server request path; synchronous `.txt` reads permitted per FR-002 |
| CORS | N/A | No HTTP server in this feature |
| Error response safety | N/A | No HTTP server in this feature |

*All applicable gates PASS. No violations to justify.*

## Project Structure

### Documentation (this feature)

```text
specs/001-ingestion-pipeline/
├── plan.md                       ← this file
├── research.md                   ← Phase 0 decisions
├── data-model.md                 ← Phase 1 entity definitions
├── quickstart.md                 ← Phase 1 operator guide
├── contracts/
│   └── module-interfaces.md     ← Phase 1 module export contracts
└── tasks.md                      ← Phase 2 (produced by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── embedder.js       ← wraps @xenova/transformers; caches model in .xenova-cache/
├── ingest.js         ← CLI entry point (npm run ingest)
└── vectorStore.js    ← exports load(), save(), search(), storeSize(); async fs.promises only

vector_store.json     ← output flat JSON array (project root, gitignored)
data/                 ← input .pdf and .txt files
.xenova-cache/        ← model weight cache (gitignored)
```

**Structure Decision**: Single flat `src/` directory. Three focused modules, no hierarchy. No test directory — spec requires integration testing only via CLI invocation.
