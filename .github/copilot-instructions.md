# Guidance for AI coding agents — UncGPT stream overlay

This file contains compact, actionable notes to help AI coding agents be productive in this repo. Focus on concrete, discoverable patterns and developer workflows.

Overview
- This project is a small Node/Express overlay server for a Twitch stream called "UncGPT". Core duties:
  - Host an overlay (`/overlay`) and a moderator panel (`/modpanel`) from static HTML/JS.
  - Maintain a persistent queue at `data/queue.json` with staged/queued/answering/answered state.
  - Produce answers using OpenAI (chat completions) and produce TTS via OpenAI audio API.
  - Broadcast state and events to overlay clients over a WebSocket server at `/ws`.

Key files
- `server.mjs` — single-process Express server + WebSocketServer. Primary logic: queue lifecycle, OpenAI calls, TTS endpoint, admin routes.
- `overlay.html` + `overlay.js` — client-side display logic, audio handling, WebSocket connection and event playback.
- `modpanel.html` + `modpanel.js` — admin UI that calls `/admin/*` routes and `/api/ask`.
- `se-realtime.mjs` — StreamElements realtime wrapper (socket.io client). Optional: only used if `SE_JWT` is set.
- `persona-unc.mjs` — prompt / persona shaping utilities used before sending to OpenAI (imported by `server.mjs`).
- `data/queue.json` — persisted store of queue items (written by server). Treat as the canonical small DB.

Environment & run notes (explicit)
- This project expects environment variables (see top of `server.mjs`). The most important ones:
  - `OPENAI_API_KEY` — used for chat completions and TTS. If missing, OpenAI features are disabled.
  - `ADMIN_TOKEN` — required for admin endpoints used by `modpanel.js` (header `X-Admin-Token`).
  - `SE_JWT` — optional; when present the server calls `connectSE({ jwt: SE_JWT })`.
  - `PORT`, `BASE_URL` — basic server bindings.

- There is no `package.json` in the repo root. The repo is run by launching `node server.mjs` from the project root where Node and the listed dependencies are available (look in `node_modules/`). Typical start (zsh):

  ```bash
  # from project root
  export OPENAI_API_KEY="sk-..."
  export ADMIN_TOKEN="secret"
  node server.mjs
  ```

Architecture & data flow (short)
- Incoming: `/api/ask` POST or SE/Twitch integration -> `receiveItem()` in `server.mjs` which creates an item with `status: 'staged'`.
- After MOD_HOLD_MS the server promotes staged -> queued (or admins can `force` via `/admin/queue/force`).
- `pump()` picks next `queued` item -> `answerItem()` makes OpenAI call -> `sendAll({type:'uncgpt:answer', ...})` -> overlay clients play audio/TTS.
- WebSocket messages use simple JSON { type: 'uncgpt:answer' | 'uncgpt:replay' | 'uncgpt:queue:update' | ... } — see `sendAll` and client `ws.onmessage` handlers in `overlay.js`.

Project-specific patterns and conventions
- Queue persistence: server writes `data/queue.json` with saveQueue/saveQueueSoon (throttled). When editing queue behaviour, update `saveQueueSoon()` usage.
- Tiering logic: `deriveTier(amountCents)` and constants `FREE_MIN` / `HYPE_MIN` in `server.mjs`. Hype items get priority.
- Admin auth: very simple header check `X-Admin-Token` vs `ADMIN_TOKEN`. Tests/agents should not assume sophisticated auth.
- TTS endpoint returns `audio/mpeg` bytes from OpenAI — `overlay.js` fetches `/api/tts?q=...` and plays via WebAudio or falls back to <audio>.
- StreamElements integration: implemented in `se-realtime.mjs` as `connectSE(opts)` — only used if env var `SE_JWT` supplied; it emits `event` callbacks.

Helpful examples (copyable snippets)
- Promote staged -> queued: call `promoteToQueued(item)` in `server.mjs`.
- Send a replay from admin: POST `/admin/overlay/replay` with header `X-Admin-Token: <ADMIN_TOKEN>`.
- Call TTS programmatically (server-side): GET `/api/tts?q=Hello%20world` returns mp3 bytes.

Editing guidelines for AI agents
- Preserve server-side data model: items hold {id,user,question,source,amountCents,tier,priority,status,ts}. Tests rely on these fields.
- When changing queue ordering, update both `queue.sort(...)` usages and `broadcastQueue()` to keep admin UI in sync.
- Avoid changing the WebSocket message shapes; clients expect `type` and named fields (see `overlay.js` and `modpanel.js`).

What I couldn't discover automatically
- Exact developer commands for installing dependencies (no top-level `package.json`). If you need `npm install`, ask the user for the intended manifest or run `npm init` to recreate it.
- Private secrets or external setup (Twitch client id/secret, StreamElements JWT). Ask the repo owner for values.

If anything here is unclear or you'd like more detail (examples of messages, tests, or a small `package.json`), tell me which part to expand and I'll iterate.
