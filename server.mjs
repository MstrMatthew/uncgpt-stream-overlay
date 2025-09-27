// server.mjs — UncGPT overlay server with strict viewer-as-asker logic

import dotenv from 'dotenv';
dotenv.config({ override: true });;
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import crypto from 'crypto';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR     = path.join(__dirname, 'data');
const QUEUE_PATH   = path.join(DATA_DIR, 'queue.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

const PORT   = Number(process.env.PORT || 3000);
const BASE   = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN  = process.env.ADMIN_TOKEN || '';
let   CURRENT_VOICE = (process.env.OPENAI_TTS_VOICE || 'ash').trim();

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL_FREE = process.env.OPENAI_MODEL_FREE || 'gpt-4o-mini';
const OPENAI_MODEL_PAID = process.env.OPENAI_MODEL_PAID || 'gpt-4o';

const FREE_MIN  = Number(process.env.FREE_TIER_MIN_CENTS || 300);   // $3
const HYPE_MIN  = Number(process.env.HYPE_TIER_MIN_CENTS || 1000);  // $10
const BITS_TO_CENTS = Number(process.env.BITS_TO_CENTS || 1);

const PERSONA_SPICE    = Number(process.env.PERSONA_SPICE || 8);
const STREAMER_NAME    = (process.env.STREAMER_NAME || 'Matthew').trim();
const STREAMER_ALIASES = (process.env.STREAMER_ALIASES || 'Matthew|MstrMatthew')
  .split('|').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase());

const TWITCH_CLIENT_ID       = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET   = process.env.TWITCH_CLIENT_SECRET || '';
const TWITCH_REDIRECT_URI    = process.env.TWITCH_REDIRECT_URI || `${BASE}/auth/twitch/callback`;
const TWITCH_EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || crypto.randomBytes(8).toString('hex');
const TWITCH_BROADCASTER_LOGIN = (process.env.TWITCH_BROADCASTER_LOGIN || '').toLowerCase();
const TWITCH_ALLOWED_REWARD_TITLE = (process.env.TWITCH_ALLOWED_REWARD_TITLE || 'Ask UncGPT').trim().toLowerCase();
const TWITCH_REQUIRE_TEXT = String(process.env.TWITCH_REQUIRE_TEXT || 'true').toLowerCase() === 'true';

const SE_JWT = process.env.SE_JWT || '';

console.log('[env] OPENAI_API_KEY:', OPENAI_API_KEY ? OPENAI_API_KEY.slice(0,7)+'…' : 'MISSING');
console.log('[env] TTS voice:', CURRENT_VOICE);
console.log('[env] FREE/HYPE cents:', FREE_MIN, HYPE_MIN);

const app = express();
app.use(express.json({ limit: '1mb' }));

[ path.join(__dirname,'public'), __dirname ].forEach(root => {
  if (fs.existsSync(root)) {
    console.log('[static]', root);
    app.use(express.static(root, { extensions: ['html'] }));
  }
});
app.get(['/overlay','/overlay.html'], (req,res)=>{
  const p1 = path.join(__dirname,'public','overlay.html');
  const p2 = path.join(__dirname,'overlay.html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('overlay.html not found');
});
app.get(['/modpanel','/modpanel.html'], (req,res)=>{
  const p1 = path.join(__dirname,'public','modpanel.html');
  const p2 = path.join(__dirname,'modpanel.html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('modpanel.html not found');
});
app.get('/health', (req,res)=> res.json({ ok:true, time:new Date().toISOString() }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sendAll = obj => {
  const s = JSON.stringify(obj);
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(s);
};
wss.on('connection', ws => {
  console.log('[ws] client connected');
  ws.on('close', ()=> console.log('[ws] client disconnected'));
});

const GAME_TERMS = /\b(elden\s*ring|fire\s*giant|boss|raid|dungeon|build|loadout|soulslike|dark\s*souls|monster hunter|boss fight|strategy|guide)\b/i;
function shouldBlock(q='') {
  const x = String(q).toLowerCase();
  if (GAME_TERMS.test(x)) return false;
  const REAL  = /\b(me|myself|him|her|them|teacher|neighbor|classmate|coworker|someone|a person|people)\b/;
  const VIOL  = /\b(kill|murder|shoot|stab|strangle|poison|bomb|maim|beat up|assault)\b/;
  return VIOL.test(x) && REAL.test(x);
}

const queue = [];
let answering = false;

function deriveTier(amountCents=0) {
  if (amountCents >= HYPE_MIN) return 'hype';
  if (amountCents >= FREE_MIN) return 'free';
  return 'free';
}
function pushItem({ user, question, amountCents=0, source='mod' }) {
  const tier = deriveTier(amountCents);
  const priority = (tier === 'hype') ? 1 : 0;
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    user, question, source, amountCents,
    tier, priority,
    status: 'queued',
    ts: Date.now()
  };
  queue.push(item);
  queue.sort((a,b)=> (b.priority-a.priority) || (a.ts-b.ts));
  broadcastQueue();
  return item;
}
function stopItem(id) {
  const i = queue.find(x => x.id === id && x.status==='queued');
  if (!i) return false;
  i.status = 'stopped';
  broadcastQueue();
  return true;
}
function bumpItem(id) {
  const i = queue.find(x => x.id === id && x.status==='queued');
  if (!i) return false;
  i.priority = 1;
  i.ts = Math.min(...queue.map(q=>q.ts)) - 1;
  queue.sort((a,b)=> (b.priority-a.priority) || (a.ts-b.ts));
  broadcastQueue();
  return true;
}
function nextQueued() { return queue.find(x => x.status === 'queued'); }
function broadcastQueue() {
  const items = queue
    .filter(x => x.status==='queued')
    .map(({id,user,question,tier,priority,source,amountCents,ts})=>({id,user,question,tier,priority,source,amountCents,ts}));
  sendAll({ type:'uncgpt:queue:update', items });
}

// ——— Persona & host/asker rules
function personaSystemPrompt(spice=8, host='Matthew', aliasList=['Matthew','MstrMatthew']) {
  const lvl = Math.max(1, Math.min(10, Number(spice)||8));
  const heat =
    lvl>=9 ? 'very bold and sharp' :
    lvl>=7 ? 'bold, spicy, and direct' :
    lvl>=5 ? 'confident and candid' : 'balanced and steady';

  return [
    `You are UncGPT — the unfiltered but respectful “uncle” mentor. Voice: ${heat}.`,
    `Light AAVE cadence is fine. No caricature. PG-13. Punch up, not down.`,
    `Brevity: roast one-liner first, then at most one short line or 2 tiny bullets.`,
    `DEFAULT ASSUMPTION: the asker is a viewer/fan (NOT the host). Address the asker directly as "you".`,
    `HOST CONTEXT: The host is ${host}. Host aliases: ${aliasList.join(', ')}.`,
    `HARD RULES:`,
    `- Do NOT speak to or about the host by name unless the asker IS the host.`,
    `- If the question mentions the host in third-person, treat it as a topic; still address the viewer. No calling out the host by name unless asker IS host.`,
    `- Never sign-off with the host's name.`,
    `Safety: refuse illegal/harmful requests with firm humor and redirect safely.`
  ].join(' ');
}
function isHostName(name='') {
  const n = String(name||'').trim().toLowerCase();
  if (!n) return false;
  if (n === STREAMER_NAME.toLowerCase()) return true;
  return STREAMER_ALIASES.includes(n);
}

// ——— LLM Answer
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

async function answerItem(item) {
  item.status = 'answering';
  const model = (item.tier === 'hype') ? OPENAI_MODEL_PAID : OPENAI_MODEL_FREE;

  let content = 'Standing by…';
  try {
    if (openai) {
      const askerIsHost = isHostName(item.user);
      const system = personaSystemPrompt(PERSONA_SPICE, STREAMER_NAME, STREAMER_ALIASES);
      const hardGuard = [
        `Context: asker_is_host=${askerIsHost}.`,
        `If asker_is_host=false:`,
        `- Treat the asker as a viewer/fan; never mention the host’s name.`,
        `- Address the asker as "you".`,
        `If asker_is_host=true:`,
        `- You may address the host directly, but still keep it brief.`,
      ].join(' ');

      const userPrompt = [
        `Asker name: ${item.user || 'Viewer'}`,
        `Question: ${item.question}`,
        `Style cap: one roast line first; then ≤1 short line or 2 tiny bullets; ≤45 words total.`,
      ].join('\n');

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'system', content: hardGuard },
          { role: 'user',   content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 140
      });
      content = completion?.choices?.[0]?.message?.content?.trim() || 'Say less.';
    }
  } catch (e) {
    console.error('[answer] openai error', e?.message || e);
  }

  sendAll({
    type: 'uncgpt:answer',
    id: item.id,
    user: item.user,
    question: item.question,
    answer: content,
    tier: item.tier
  });

  item.status = 'answered';
  broadcastQueue();
}
async function pump() {
  if (answering) return;
  const item = nextQueued();
  if (!item) return;
  answering = true;
  try { await answerItem(item); }
  catch (e) { console.error('[answer] error', e); item.status = 'blocked'; }
  finally { answering = false; setTimeout(pump, 300); }
}

// ——— API: ask + queue controls
app.post('/api/ask', async (req,res) => {
  try {
    const { user='Viewer', question='', amountCents=0, source='mod' } = req.body || {};
    if (!question) return res.status(400).json({ error:'Missing question' });
    if (shouldBlock(question)) {
      sendAll({ type:'uncgpt:moderation_block', user, question });
      return res.status(400).json({ error:'blocked' });
    }
    const item = pushItem({ user, question, amountCents, source });
    pump();
    res.json({ ok:true, id:item.id, tier:item.tier });
  } catch (e) { console.error('/api/ask error', e); res.status(500).json({ error:'server_error' }); }
});
app.get('/api/queue', (req,res)=> {
  res.json({ items: queue.map(x=>({
    id:x.id, user:x.user, question:x.question, tier:x.tier,
    priority:x.priority, status:x.status, source:x.source,
    amountCents:x.amountCents, ts:x.ts
  }))});
});
app.post('/api/queue/:id/stop', (req,res)=> {
  const ok = stopItem(req.params.id);
  if (!ok) return res.status(404).json({ error:'not_found' });
  res.json({ ok:true });
});
app.post('/api/queue/:id/answer-now', (req,res)=> {
  const ok = bumpItem(req.params.id);
  if (!ok) return res.status(404).json({ error:'not_found' });
  pump();
  res.json({ ok:true });
});

// ——— Admin
let TTS_MUTED = false;
app.put('/admin/tts/voice', (req,res)=>{
  if (!ADMIN) return res.status(403).json({ error:'ADMIN_TOKEN not set' });
  if ((req.headers['x-admin-token']||'') !== ADMIN) return res.status(403).json({ error:'forbidden' });
  const v = (req.query.voice || '').toString().trim();
  if (!v) return res.status(400).json({ error:'missing voice' });
  CURRENT_VOICE = v; console.log('[tts] default voice set to:', CURRENT_VOICE);
  res.json({ ok:true, voice: CURRENT_VOICE });
});
app.put('/admin/tts/mute', (req,res)=>{
  if (!ADMIN) return res.status(403).json({ error:'ADMIN_TOKEN not set' });
  if ((req.headers['x-admin-token']||'') !== ADMIN) return res.status(403).json({ error:'forbidden' });
  TTS_MUTED = String(req.query.enabled||'').toLowerCase() === 'true';
  sendAll({ type:'uncgpt:tts_mute', enabled: TTS_MUTED });
  res.json({ ok:true, enabled: TTS_MUTED });
});
app.post('/admin/overlay/replay', (req,res)=>{
  if (!ADMIN) return res.status(403).json({ error:'ADMIN_TOKEN not set' });
  if ((req.headers['x-admin-token']||'') !== ADMIN) return res.status(403).json({ error:'forbidden' });
  sendAll({ type:'uncgpt:replay' });
  res.json({ ok:true });
});

// ——— TTS (MP3)
app.get('/api/tts', async (req,res) => {
  try {
    if (TTS_MUTED) return res.status(204).end();
    const text = (req.query.q ?? '').toString().slice(0, 800) || 'Hello from UncGPT';
    const voice = (req.query.voice || CURRENT_VOICE || 'ash').toString();
    if (!openai) {
      const fallback = path.join(__dirname, 'sounds', 'ask.mp3');
      if (fs.existsSync(fallback)) return res.sendFile(fallback);
      return res.status(500).send('TTS not configured');
    }
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice, input: text, format: 'mp3'
    });
    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buffer);
  } catch (e) {
    console.error('TTS error:', e?.status || '', e?.message || e);
    res.status(500).send('TTS failed');
  }
});

// ——— Twitch OAuth & EventSub (unchanged logic except auth refresh)
const TOKENS_PATH = path.join(__dirname, 'tokens.twitch.json');
function readTwitchTokens() { try { return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8')); } catch { return null; } }
function writeTwitchTokens(obj) { try { fs.writeFileSync(TOKENS_PATH, JSON.stringify(obj, null, 2)); } catch {} }

async function getValidTwitchTokens() {
  let tok = readTwitchTokens();
  if (!tok?.access_token) return null;
  const expiresMs = Number(tok.expires_in || 0) * 1000;
  const ageMs     = Date.now() - Number(tok.obtained || 0);
  const slack     = 5 * 60 * 1000;
  if (!expiresMs || ageMs >= (expiresMs - slack)) {
    try {
      tok = await refreshTwitchToken(tok);
      tok.obtained = Date.now();
      writeTwitchTokens(tok);
      console.log('[twitch] token refreshed');
    } catch (e) { console.error('[twitch] refresh failed:', e?.message || e); return null; }
  }
  return tok;
}

app.get('/auth/twitch/login', (req,res)=>{
  const state = crypto.randomBytes(8).toString('hex');
  const scope = encodeURIComponent('channel:read:redemptions');
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}`;
  res.redirect(url);
});
app.get('/auth/twitch/callback', async (req,res)=>{
  const code = req.query.code?.toString() || '';
  if (!code) return res.status(400).send('Missing code');
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code, grant_type:'authorization_code', redirect_uri: TWITCH_REDIRECT_URI
    })
  });
  const tok = await tokenRes.json();
  if (!tok.access_token) return res.status(500).send('Twitch token exchange failed');

  const userRes = await fetch('https://api.twitch.tv/helix/users', {
    headers:{ 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': 'Bearer '+tok.access_token }
  });
  const userJson = await userRes.json();
  const me = userJson?.data?.[0];
  if (!me) return res.status(500).send('Twitch user lookup failed');

  writeTwitchTokens({
    obtained: Date.now(),
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_in: tok.expires_in,
    user_id: me.id,
    login: me.login
  });

  res.send(`✅ Twitch linked for @${me.login}. You can close this tab and return to the app.`);
  setTimeout(() => { startEventSubWS().catch(console.error); }, 500);
});
app.get(['/api/twitch/oauth/callback','/api/twitch/callback'], (req,res)=>{
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(302, `/auth/twitch/callback${qs ? `?${qs}` : ''}`);
});
async function refreshTwitchToken(old) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: old.refresh_token
    })
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error('refresh failed');
  const merged = { ...old, ...tok };
  writeTwitchTokens(merged);
  return merged;
}

let eventsubWS = null;
async function startEventSubWS() {
  try { if (eventsubWS) eventsubWS.close(); } catch {}
  const tok = await getValidTwitchTokens();
  if (!tok?.access_token) { console.log('[twitch] not linked yet. Visit /auth/twitch/login'); return; }

  const url = 'wss://eventsub.wss.twitch.tv/ws';
  eventsubWS = new WSClient(url);
  let sessionId = null;

  eventsubWS.on('open', () => console.log('[twitch] WS open'));
  eventsubWS.on('close', () => console.log('[twitch] WS closed'));
  eventsubWS.on('error', err => console.error('[twitch] WS error', err?.message || err));

  eventsubWS.on('message', async (buf) => {
    let msg = null;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    const mtype = msg?.metadata?.message_type;

    if (mtype === 'session_welcome') {
      const sid = msg?.payload?.session?.id;
      sessionId = sid;
      console.log('[twitch] session id:', sessionId);
      await ensureChannelPointsSubscription(sessionId, tok);
      return;
    }

    if (mtype === 'notification') {
      const { subscription, event } = msg.payload || {};
      if (subscription?.type === 'channel.channel_points_custom_reward_redemption.add') {
        const user  = event?.user_name || 'Viewer';
        const title = (event?.reward?.title || 'Channel Points').trim();
        const input = (event?.user_input || '').trim();

        if (TWITCH_ALLOWED_REWARD_TITLE && title.toLowerCase() !== TWITCH_ALLOWED_REWARD_TITLE) {
          console.log('[twitch] redeem ignored (title mismatch):', title);
          return;
        }
        if (TWITCH_REQUIRE_TEXT && !input) {
          console.log('[twitch] redeem ignored (no text):', title);
          return;
        }

        const question = input || `asks: ${title}`;
        console.log('[twitch] redeem accepted:', title, 'by', user);
        pushItem({ user, question, amountCents: FREE_MIN, source: 'channel_points' });
        pump();
      }
      return;
    }

    if (mtype === 'session_reconnect') {
      const newUrl = msg?.payload?.session?.reconnect_url;
      if (newUrl) {
        console.log('[twitch] reconnecting…');
        try { eventsubWS?.close(); } catch {}
        eventsubWS = new WSClient(newUrl);
      }
      return;
    }
  });
}
async function ensureChannelPointsSubscription(sessionId, tok) {
  let broadcasterId = null;
  if (TWITCH_BROADCASTER_LOGIN) {
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(TWITCH_BROADCASTER_LOGIN)}`, {
      headers:{ 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': 'Bearer '+tok.access_token }
    });
    const j = await res.json();
    broadcasterId = j?.data?.[0]?.id;
  } else {
    broadcasterId = tok.user_id;
  }
  if (!broadcasterId) { console.warn('[twitch] could not resolve broadcaster id'); return; }

  const makeReq = (bearer) => fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method:'POST',
    headers:{
      'Client-Id': TWITCH_CLIENT_ID,
      'Authorization': 'Bearer '+bearer,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
      transport: { method: 'websocket', session_id: sessionId }
    })
  });

  let subRes = await makeReq(tok.access_token);
  if (subRes.status === 401) {
    console.warn('[twitch] subscribe 401; refreshing token and retrying once…');
    const fresh = await refreshTwitchToken(tok);
    fresh.obtained = Date.now();
    writeTwitchTokens(fresh);
    subRes = await makeReq(fresh.access_token);
    if (!subRes.ok) {
      let msg = {}; try { msg = await subRes.json(); } catch {}
      console.error('[twitch] subscribe retry failed:', msg);
      return;
    }
    console.log('[twitch] EventSub subscribed after refresh');
    return;
  }
  const sj = await subRes.json().catch(()=> ({}));
  if (subRes.ok) console.log('[twitch] EventSub subscribed:', sj.data?.[0]?.id || 'ok');
  else console.error('[twitch] subscribe error:', sj);
}

// ——— StreamElements (unchanged behavior)
let seWS = null;
function startStreamElementsWS() {
  if (!SE_JWT) { console.log('[se] SE_JWT missing; tips/bits disabled'); return; }
  try { if (seWS) seWS.close(); } catch {}

  const url = 'wss://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket';
  seWS = new WSClient(url);
  function send(obj) { try { seWS.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch {} }

  seWS.on('open', ()=> console.log('[se] ws open'));
  seWS.on('close', ()=> { console.log('[se] ws closed, retrying in 5s'); setTimeout(startStreamElementsWS, 5000); });
  seWS.on('error', err => console.error('[se] ws error', err?.message||err));

  seWS.on('message', (data) => {
    const text = data.toString();
    if (text === '40') { send(`42["authenticate",{"method":"jwt","token":"${SE_JWT}"}]`); return; }
    if (!text.startsWith('42')) return;

    const idx = text.indexOf('[');
    if (idx === -1) return;
    let arr = null; try { arr = JSON.parse(text.slice(idx)); } catch { return; }
    const [eventName, payload] = arr;

    if (eventName === 'authenticated') { console.log('[se] authenticated'); return; }

    if (eventName === 'event') {
      const d = payload?.data || {};

      if (payload?.type === 'tip') {
        const user = d?.username || 'Tipper';
        const amount = Number(d?.amount || 0);
        const amountCents = Math.round(amount * 100);
        const message = (d?.message || '').toString().trim();

        console.log('[se] tip:', user, amount);
        if (amountCents < FREE_MIN) { console.log('[se] tip ignored (<$3):', user, amount); return; }

        const match = message.match(/^asks:\s*(.+)/i);
        if (!match) { console.log('[se] tip ignored (no asks: prefix):', message); return; }

        pushItem({ user, question: match[1], amountCents, source: 'tips' });
        pump(); return;
      }

      if (payload?.type === 'cheer') {
        const user = d?.username || 'Cheerer';
        const bits = Number(d?.amount ?? d?.bits ?? d?.quantity ?? 0);
        const amountCents = Math.round(bits * BITS_TO_CENTS);
        const message = (d?.message || '').toString().trim();

        console.log('[se] cheer:', user, bits, 'bits ->', amountCents, '¢');

        const REQUIRED_BITS = Math.ceil(FREE_MIN / BITS_TO_CENTS);
        if (bits < REQUIRED_BITS) { console.log('[se] cheer ignored (<', REQUIRED_BITS, 'bits):', user, bits); return; }

        const match = message.match(/^asks:\s*(.+)/i);
        if (!match) { console.log('[se] cheer ignored (no asks: prefix):', message); return; }

        pushItem({ user, question: match[1], amountCents, source: 'bits' });
        pump(); return;
      }
    }
  });
}

// ——— Boot
server.listen(PORT, ()=>{
  console.log(`Listening on ${BASE} (PORT ${PORT})`);
  console.log('Overlay :', `${BASE}/overlay.html`);
  console.log('ModPanel:', `${BASE}/modpanel.html`);
  console.log('WS     :', `${BASE.replace('http','ws')}/ws`);
  startEventSubWS().catch(()=>{});
  startStreamElementsWS();
});

// (Optional: queue/history persistence stubs)
function ensureDataDir() { try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive:true }); } catch {} }
