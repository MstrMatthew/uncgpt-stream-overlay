Drill Sergeant GPT (Stream Overlay + Mod Panel)

Lightweight local overlay + moderator panel for Twitch Q&A with TTS and EventSub.

Features

Overlay: alert sound → queued TTS (user question → answer), HYPE glow ($10+), rotating ticker, auto-clear.

Mod Panel: ask queue, prioritize HYPE, replay last answer, server-side mute/unmute TTS.

Twitch EventSub integration; simple local REST endpoints for testing.

Local-only by default; works on LAN for moderators.

Quick Start (local)
# Node 18+ (you have Node 24)
npm install
drillstart   # helper alias prints URLs and current admin token


Open:

Overlay: http://localhost:3000/overlay.html

Mod Panel: http://localhost:3000/modpanel.html

Twitch OAuth (local)

Add this Redirect URI in your Twitch developer app and .env:

http://localhost:3000/auth/twitch/callback


Then visit: http://localhost:3000/auth/twitch/login

Environment (.env)

Create a .env in the project root (names only; values not committed):

PORT=3000
BASE_URL=http://localhost:3000
OPENAI_API_KEY=…
TWITCH_CLIENT_ID=…
TWITCH_CLIENT_SECRET=…
TWITCH_BROADCASTER_LOGIN=…
TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback
SE_JWT=…
ADMIN_TOKEN=…   # see README-QUICKOPS.md for ops

Health & Test
curl -s http://127.0.0.1:3000/health
curl -s -X POST http://127.0.0.1:3000/api/ask \
  -H 'Content-Type: application/json' \
  --data '{"user":"Tester","question":"asks: smoke test","amountCents":300,"source":"mod"}'

Security

.env, tokens.twitch.json, .admin_token are ignored by git and blocked by hooks.

Do not commit secrets. See README-QUICKOPS.md for operational details.

License

MIT
