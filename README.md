UncGPT Stream Overlay
Twitch/OBS overlay + Mod Panel powered by OpenAI. Viewers redeem Channel Points or tip to ask UncGPT questions. HYPE messages (≥ $3) jump the line and trigger a green glow. Clean audio pipeline for OBS with question → answer TTS.
What it does
Auto-queues questions from Twitch Channel Points (via EventSub WebSocket) and StreamElements tips/bits (via Realtime WS).
Plays ask SFX, speaks the question then the answer with OpenAI TTS (default voice: ash).
HYPE tier (≥ $3) jumps the queue + green glow.
Mod Panel: per-item Stop, Answer Now; Voice change, Mute TTS, Replay last.
Features
⚡️ Zero webhooks: uses Twitch EventSub WebSocket (no public URL needed).
🟢 Tiering: $1 = free tier; $3 = HYPE (configurable).
💬 Bits mapping: 1 bit = 1¢ (configurable).
🔊 OBS-friendly audio: MP3 TTS stream + SFX (ask.mp3, hype.mp3).
🎚 Mod controls: voice picker, TTS mute, replay, per-question Stop/Answer Now.
🛡 Filter to a specific reward (e.g., “Ask UncGPT”) + optional “require text”.
🧩 Plain Node/Express + client-side HTML/CSS/JS. No DB required.
Quick start
git clone https://github.com/MstrMatthew/uncgpt-stream-overlay.git
cd uncgpt-stream-overlay

# 1) Environment
cp .env.example .env
#   → Open .env and fill your keys (OpenAI, Twitch app, StreamElements JWT)

# 2) Install & run
npm i
node server.mjs

# 3) Open these in your browser
# Overlay  : http://localhost:3000/overlay.html
# ModPanel : http://localhost:3000/modpanel.html
# Health   : http://localhost:3000/health
OBS tip: Add overlay.html as a Browser Source, enable Control audio via OBS, and in Advanced Audio Properties set it to Monitor and Output. After edits, right-click the Browser Source → Refresh cache of current page.
Configure .env
Everything runs locally. Never commit .env to Git.
# Server
PORT=3000
BASE_URL=http://localhost:3000

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL_FREE=gpt-4o-mini
OPENAI_MODEL_PAID=gpt-4o
OPENAI_TTS_VOICE=ash

# Pricing thresholds (in cents)
FREE_TIER_MIN_CENTS=100   # $1
HYPE_TIER_MIN_CENTS=300   # $3
BITS_TO_CENTS=1           # 1 bit = 1¢

# Admin (for mod controls)
ADMIN_TOKEN=some-long-random-string

# Twitch (Channel Points via EventSub WebSocket)
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback
TWITCH_BROADCASTER_LOGIN=yourtwitchname
TWITCH_EVENTSUB_SECRET=any-random-string

# Filter to ONE custom reward (optional but recommended)
TWITCH_ALLOWED_REWARD_TITLE=Ask UncGPT
TWITCH_REQUIRE_TEXT=true

# StreamElements (tips/bits)
SE_JWT=your-stream-elements-jwt
One-time linking
Twitch (Channel Points)
Create an app: https://dev.twitch.tv/console/apps
Redirect URL: http://localhost:3000/auth/twitch/callback
Put Client ID/Secret into .env.
Start the server, then visit:
http://localhost:3000/auth/twitch/login
You’ll see “✅ Twitch linked …” and a tokens.twitch.json will appear.
Set your custom Channel Points reward to exactly the title in TWITCH_ALLOWED_REWARD_TITLE (default: Ask UncGPT) and enable Require Viewer to Enter Text.
StreamElements (tips/bits)
Copy your JWT Token from SE Dashboard → Channel.
Put it in .env as SE_JWT.
Restart the server; logs should show [se] ws open → [se] authenticated.
URLs
Overlay (OBS/browser): http://localhost:3000/overlay.html
Mod Panel: http://localhost:3000/modpanel.html
Health: http://localhost:3000/health
TTS test: http://localhost:3000/api/tts?q=Voice%20test&voice=ash
Admin (require X-Admin-Token header):
Set voice: PUT /admin/tts/voice?voice=ash
Mute TTS: PUT /admin/tts/mute?enabled=true|false
Replay last: POST /admin/overlay/replay
Example (curl):
curl -X PUT "http://localhost:3000/admin/tts/voice?voice=ash" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
File structure
.
├── server.mjs                # Express server + WS + EventSub + SE realtime + TTS
├── overlay.html              # OBS/browser overlay
├── overlay.css               # Styling (banner + HYPE glow)
├── overlay.js                # TTS queue (question → answer), WS client, SFX
├── modpanel.html             # Mod panel UI (queue controls + voice/mute/replay)
├── modpanel.js               # Mod panel logic
├── sounds/
│   ├── ask.mp3
│   ├── hype.mp3
│   └── promo.mp3
├── banner.png
├── .env.example              # Safe template (commit this, not .env)
├── .gitignore                # Keeps secrets & junk out of git
└── tokens.twitch.json        # (created after linking; ignored by git)
Security notes
Keep it local: bind to loopback if you like:
server.listen(PORT, '127.0.0.1', () => { ... });
Never commit .env or tokens.twitch.json. They’re already in .gitignore.
Only share binaries/media (banner, sounds), not keys.
Troubleshooting
OBS shows a big black box → ensure overlay.css sets html, body { background: transparent !important; }.
No audio → click the overlay once (browser audio unlock), set OBS source to Monitor and Output.
No Channel Points events → link Twitch again: /auth/twitch/login. Make sure the reward name matches TWITCH_ALLOWED_REWARD_TITLE and “Require text” is ON.
SE not connecting → check SE_JWT and restart; look for [se] authenticated.
Only question or only answer speaks → check Network tab: you should see two /api/tts?... MP3 requests per Q/A.
Contributing
PRs welcome! Please keep changes focused and include quick test steps.
Dev hints
Code style is minimal/vanilla; no build step required.
The overlay audio elements are #sfx and #tts.
“HYPE” state is just #cta.hype-active (green pulse via CSS keyframes).
📣 Feedback welcome
We’d love your eyes on the code and UX.
👉 Start here: open or comment on the pinned Discussion: “Request for code & UX review (UncGPT overlay)”.
What we’re looking for
Code clarity (server structure, WS handling, error paths)
Security (env handling, local binding, token storage)
UX (overlay readability over banner, HYPE glow timing, Mod Panel controls)
Performance (TTS timing, queue behavior, OBS audio)
Quick review steps
cp .env.example .env and fill in keys
npm i && node server.mjs
Open http://localhost:3000/modpanel.html → add a test ask (100¢) or HYPE (300¢)
Good first issues
Volume sliders for SFX/TTS in Mod Panel
Bits combo: aggregate cheers within 30s → auto-HYPE if ≥ 300¢
Optional persistence: save last 100 Q/As to JSON + CSV export
License
MIT © MstrMatthew
