Drill Sergeant GPT — Quick Ops (Local)

Baseline: 2025-09-27
Primary folder: /Users/MstrMatthew/Desktop/drillsgpt
Admin token (persistent): superstreamer123

1) Daily start (most used)
drillstart


You should see:

Listening on http://localhost:3000

Overlay + ModPanel URLs

Admin token: superstreamer123 (printed on start)

Open:

Overlay: http://localhost:3000/overlay.html

Mod Panel: http://localhost:3000/modpanel.html

2) Quick tests

Health

curl -s http://127.0.0.1:3000/health


Ask flow (smoke)

curl -s -X POST http://127.0.0.1:3000/api/ask \
  -H 'Content-Type: application/json' \
  --data '{"user":"Tester","question":"asks: smoke test","amountCents":300,"source":"mod"}'


TTS endpoint responds

curl -I "http://127.0.0.1:3000/api/tts?q=hello"

3) Admin token (mods)

Current mode: persistent token via .env → ADMIN_TOKEN=superstreamer123

Verify token works (unmute TTS)

curl -s -X PUT "http://127.0.0.1:3000/admin/tts/mute?enabled=false" \
  -H "x-admin-token: superstreamer123"


200 = good

403 = token mismatch (server started with a different token). Fix .env and restart with drillstart.

4) Twitch auth (fast fixes)

Login (local):
http://localhost:3000/auth/twitch/login

Callback URL (must match Twitch Dev Console):

http://localhost:3000/auth/twitch/callback


If you see “Redirect URI mismatch”

In Twitch Dev Console: set the callback exactly as above

In .env: TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback

Restart the server: drillstart

If you see 401 “Invalid OAuth token” after long downtime

That’s normal expiry. Visit /auth/twitch/login once to refresh, then you’re good.

5) Overlay behavior (reference)

Alert sound → wait ~3s → TTS: “USER asks …” → wait ~1.5s → TTS of answer

Queueing: new questions wait for current TTS to finish

HYPE glow: ~12s when amount ≥ $10 (1000 cents)

Bottom ticker pauses during speech; banner auto-clears ~60s after answer

If silent in Chrome/Safari: click 🔊 Click to enable sound once

6) LAN Mod Panel (brother’s PC)

Find your Mac’s LAN IP:

ipconfig getifaddr en0 || ipconfig getifaddr en1


Share:

http://<YOUR-MAC-IP>:3000/modpanel.html


Token to enter: superstreamer123

If it fails: confirm server running, both on same Wi-Fi, macOS Firewall allows Terminal/Node, and http://<YOUR-MAC-IP>:3000/health returns JSON.

7) Troubleshooting quick hits

403 on admin routes → wrong token; match .env and restart.

No Twitch events → visit /auth/twitch/login; look for “EventSub subscribed” in server log.

No audio → unmute via admin PUT (above) and click the sound gate once in the overlay tab.

Blob 404s in console → harmless; playback still works.

Redirect mismatch → fix callback in Twitch + .env, restart.

8) Git & releases (handy commands)

Save & push

git add -A
git commit -m "update: <what changed>"
git push origin HEAD


Tag + sanitized ZIP to Desktop

# auto-bump next v1.000, v1.001, …
release-next

# or explicit
release v1.003 "overlay audio gate + repo hardening"


Verify local == GitHub

git fetch origin
git rev-parse HEAD
git rev-parse origin/main

9) Optional: rotating mod token (per-boot random)

Use only if you want a new token each start (share with mods per session). To enable later:

sed -i '' -e '/^alias drillstart=/d' ~/.zshrc
cat >> ~/.zshrc <<'EOS'
alias drillstart='cd /Users/MstrMatthew/Desktop/drillsgpt; \
TOKEN=$(openssl rand -hex 24); \
sed -i "" -e "/^ADMIN_TOKEN=/d" .env; printf "ADMIN_TOKEN=%s\n" "$TOKEN" >> .env; \
printf "%s" "$TOKEN" > .admin_token; echo Admin token: $TOKEN; \
npm start'
EOS
source ~/.zshrc


To go back to persistent, set ADMIN_TOKEN=superstreamer123 in .env and restore your normal drillstart.

### Safari TTS tip
If you don’t hear TTS in Safari but the alert plays:
1) Safari → Settings for This Website… → Auto-Play: **Allow All Auto-Play**
2) Reload and click once in the overlay tab.
(We also ship a Safari fallback that uses the <audio> element when WebAudio is suspended.)
