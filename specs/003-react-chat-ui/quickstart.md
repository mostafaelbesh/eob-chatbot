# Quickstart: React Chat UI

**Feature**: 003-react-chat-ui
**Date**: 2026-05-25

---

## Prerequisites

- Node 20 installed
- Express server running on port 3001 (`npm start` from project root)
- `vector_store.json` populated (`npm run ingest` from project root)

---

## Dev Setup (first time)

```bash
cd client
npm install
```

## Run Dev Server

```bash
# Terminal 1 — Express API
npm start

# Terminal 2 — Vite UI (from project root)
npm run dev:client
```

Open `http://localhost:5173` in a browser.

The Vite dev server proxies `/api/*` to `http://localhost:3001`, so no CORS configuration is needed during development.

---

## Production Build

```bash
cd client
npm run build
```

Output goes to `client/dist/`. The Express server already serves this directory as a static fallback (see `src/server.js`).

---

## File Reference

| File | Purpose |
|---|---|
| `client/package.json` | React 18 + react-dom 18 runtime deps; vite + @vitejs/plugin-react dev deps |
| `client/vite.config.js` | Vite plugin, port 5173, `/api` proxy to `:3001` |
| `client/index.html` | HTML shell; mounts `<div id="root">` |
| `client/src/main.jsx` | `ReactDOM.createRoot` entry point |
| `client/src/App.jsx` | Entire chat UI: state, handlers, render |

---

## Verifying the UI Manually

1. Load `http://localhost:5173` — four suggested-question buttons should be visible.
2. Click "What is my dental copay?" — the question appears as a right-aligned bubble and the typing indicator appears.
3. Wait for the response — a left-aligned bot bubble with answer and (if applicable) citations appears.
4. Simulate a network error by stopping the Express server and sending another question — the error bar and fallback bot bubble appear.
5. Restart Express and send a question — the error bar clears and normal flow resumes.

---

## Color Palette

| Token | Hex |
|---|---|
| Navy | `#1a3a5c` |
| Teal | `#0891b2` |
| Background | `#f0f4f8` |
| White | `#ffffff` |
| Amber (refusal badge) | `#f59e0b` |
| Error red | `#dc2626` |
