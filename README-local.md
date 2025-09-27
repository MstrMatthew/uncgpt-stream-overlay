# Drill Sergeant GPT — LOCAL Paths & Twitch OAuth (localhost)
**Last updated:** 2025-09-27

Use these URLs and commands while testing on your machine. This version also includes the **Admin Token** workflow (generate, persist, rotate, verify) and LAN access notes for the Mod Panel.

---

## Local Server (PORT=3000)
- **Overlay (viewer):** `http://localhost:3000/overlay.html`
- **Mod Panel (mods):** `http://localhost:3000/modpanel.html`
- **WebSocket:** `ws://localhost:3000/ws`
- **REST – ask endpoint:** `POST http://localhost:3000/api/ask`
- **Health check:** `GET http://localhost:3000/health`

### Start the server (Terminal)
```bash
cd /Users/MstrMatthew/Desktop/drillsgpt
npm start
# or, explicitly:
PORT=3000 node server.mjs

