# Quickstart: Document Ingestion Pipeline

**Branch**: `001-ingestion-pipeline`

---

## Prerequisites

- Node 20 installed (`node --version` should print `v20.x.x`)
- Dependencies installed: `npm install`
- At least one `.pdf` or `.txt` EOB document placed in `./data/`

---

## Run the Ingestion Pipeline

```bash
npm run ingest
```

Expected terminal output:

```
Embedding chunk 1 / 42
Embedding chunk 2 / 42
...
Embedding chunk 42 / 42

Ingested 42 chunks from 3 file(s) → vector_store.json
```

The counter on the second-to-last line overwrites itself in place. Once complete, `vector_store.json` appears (or is replaced) at the project root.

---

## Verify the Output

Spot-check the written store:

```bash
node -e "
  const store = require('./vector_store.json');
  const e = store[0];
  console.log('entries:', store.length);
  console.log('fields:', Object.keys(e).sort().join(', '));
  console.log('embedding dims:', e.embedding.length);
  console.log('sample text:', e.text.slice(0, 80));
"
```

Expected output (values will vary):
```
entries: 42
fields: chunkIndex, embedding, source, text
embedding dims: 384
sample text: Member: Jane Doe  Member ID: 123456789  Group Number: ABC-001  Plan: Blue...
```

---

## Graceful PDF Fallback (when `pdf-parse` is absent)

If `pdf-parse` is not installed, the script warns and skips `.pdf` files while continuing to process `.txt` files:

```
[warn] pdf-parse not available — skipping eob-2024-q1.pdf
Embedding chunk 1 / 8
...
Ingested 8 chunks from 1 file(s) → vector_store.json
```

The exit code is still `0` provided at least one `.txt` file produced chunks.

---

## No Eligible Files — Exit Code 1

If `./data/` is empty or contains no `.pdf`/`.txt` files (or all PDFs are skipped and no `.txt` files exist):

```
No eligible files found in ./data/
```

Process exits with code `1`. Check `echo $?` (Unix) or `$LASTEXITCODE` (PowerShell) to confirm.

---

## Re-ingesting After Adding Documents

The pipeline fully overwrites `vector_store.json` on every run. Simply add or remove files in `./data/` and re-run `npm run ingest`.

---

## Model Cache

On first run, `Xenova/all-MiniLM-L6-v2` model weights are downloaded and cached in `.xenova-cache/` at the project root. Subsequent runs load from cache and require no network access.

Approximate cache size: ~25 MB (quantized model).

The `.xenova-cache/` directory is listed in `.gitignore` and must not be committed.
