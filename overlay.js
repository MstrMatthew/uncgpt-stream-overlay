// UncGPT Overlay — queued TTS (question -> answer), hype glow, rotating copy, WS
// Includes server-driven TTS mute + replay last answer

const CONFIG = {
  wsPath: '/ws',
  sfx: { ask:'/sounds/ask.mp3', hype:'/sounds/hype.mp3', promo:'/sounds/promo.mp3', volume:0.9 },
  tts: { enabled:true, endpoint:'/api/tts', voiceHint:'', volume:1.0, rate:1.0, pitch:1.0 },
  durations: { preTtsDelayMs_question: 600, preTtsDelayMs_answer: 250, hypeMs: 12000, tickerMs: 4500 }
};

const els = {
  cta:document.getElementById('cta'),
  user:document.getElementById('ctaUser'),
  q:document.getElementById('ctaQuestion'),
  a:document.getElementById('ctaAnswer'),
  sfx:document.getElementById('sfx'),
  tts:document.getElementById('tts'),
  ticker:document.getElementById('ctaTicker')
};

// ===== Helpers =====
function text(el, v){ if(el) el.textContent = v ?? ''; }
function add(cls){ els.cta && els.cta.classList.add(cls); }
function remove(cls){ els.cta && els.cta.classList.remove(cls); }
function normalizeQuestion(q=''){ return String(q).replace(/^asks:\s*/i,'').trim(); }

// ===== Rotating ticker =====
(function ticker(){
  const nodes = els.ticker?.querySelectorAll('.msg') || [];
  if (!nodes.length) return;
  let i=0;
  nodes[0].classList.add('active');
  setInterval(()=>{
    nodes.forEach(n=>n.classList.remove('active'));
    i=(i+1)%nodes.length;
    nodes[i].classList.add('active');
  }, CONFIG.durations.tickerMs);
})();

// ===== Audio unlock =====
let audioUnlocked=false;
function unlock(){
  if (audioUnlocked) return;
  [els.sfx, els.tts].forEach(el=>{
    if(!el) return;
    el.volume=0.001; el.src=CONFIG.sfx.ask;
    el.play().then(()=>{ el.pause(); el.currentTime=0; }).catch(()=>{});
  });
  audioUnlocked=true;
  console.log('[audio] unlocked');
}
window.addEventListener('pointerdown', unlock, {once:true});
window.addEventListener('keydown', unlock, {once:true});
window.addEventListener('load', ()=>setTimeout(unlock,300));

// ===== SFX =====
function playSfx(kind){
  const src = CONFIG.sfx[kind]; if(!src||!els.sfx) return;
  els.sfx.volume = CONFIG.sfx.volume ?? 1.0;
  if (els.sfx.src !== src) els.sfx.src = src;
  els.sfx.currentTime=0; els.sfx.play().catch(()=>{});
}

// ===== TTS queue (question -> answer, no overlap) =====
window.__UNC_TTS_MUTED__ = false;      // server can toggle this
window.__unc_last__ = null;            // last { user, q, a, tier } for replay

const TTS = (() => {
  let queue=[], playing=false;
  function next(){
    if (playing) return;
    const item = queue.shift(); if(!item) return;
    playing = true;

    const pre = (item.kind==='question') ? (CONFIG.durations.preTtsDelayMs_question||600)
                                          : (CONFIG.durations.preTtsDelayMs_answer||250);

    setTimeout(()=>{
      const base = CONFIG.tts.endpoint || '/api/tts';
      const voice = CONFIG.tts.voiceHint ? `&voice=${encodeURIComponent(CONFIG.tts.voiceHint)}` : '';
      const url = `${base}?q=${encodeURIComponent(item.text)}${voice}`;
      if (item.kind==='question') playSfx('ask');
      if (!els.tts) { playing=false; return next(); }
      els.tts.volume = CONFIG.tts.volume ?? 1.0;
      els.tts.src = url; els.tts.currentTime=0;
      els.tts.play().then(()=>{}).catch(()=>{ playing=false; next(); });
    }, pre);
  }
  els.tts?.addEventListener('ended', ()=>{ playing=false; next(); });
  els.tts?.addEventListener('error', ()=>{ playing=false; next(); });
  return {
    reset(){ try{ els.tts.pause(); }catch{} playing=false; queue=[]; },
    enqueue(text, kind){
      if(!CONFIG.tts.enabled || !text || window.__UNC_TTS_MUTED__) return;
      queue.push({text,kind}); next();
    }
  };
})();

// ===== UI =====
function showQuestion(user, q){
  text(els.user, user || 'Viewer');
  text(els.q, normalizeQuestion(q||''));   // fix “asks asks”
  text(els.a, '');
  remove('hype-active');
}
function showAnswer(ans){ text(els.a, (ans||'').trim()); }
function triggerHype(){ add('hype-active'); playSfx('hype'); setTimeout(()=>remove('hype-active'), CONFIG.durations.hypeMs); }

// ===== WebSocket =====
let ws=null, retry=null;
function connect(){
  try{ if(ws) ws.close(); }catch{}
  const scheme = location.protocol==='https:' ? 'wss':'ws';
  ws = new WebSocket(`${scheme}://${location.host}${CONFIG.wsPath}`);
  ws.onopen = ()=>console.log('[ws] connected');
  ws.onclose = ()=>{ console.log('[ws] closed, retrying…'); clearTimeout(retry); retry=setTimeout(connect,1200); };
  ws.onerror = ()=>ws.close();
  ws.onmessage = (ev)=>{
    let msg=null; try{ msg = JSON.parse(ev.data); }catch{ return; }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'uncgpt:answer': {
        const user = msg.user || 'Viewer';
        const q = msg.question || '';
        const a = msg.answer || '';
        showQuestion(user, q);
        showAnswer(a);
        // remember last for replay
        window.__unc_last__ = { user, q, a, tier: msg.tier };
        // speak in order
        TTS.reset();
        TTS.enqueue(`${user} asks: ${normalizeQuestion(q)}`, 'question');
        if (a) TTS.enqueue(a, 'answer');
        if (msg.tier === 'hype') triggerHype();
        break;
      }
      case 'uncgpt:moderation_block': {
        showQuestion(msg.user||'Viewer', msg.question||'');
        showAnswer('Can’t answer that. Ask something safe.');
        break;
      }
      case 'uncgpt:queue:update':
        // optional: display queue length somewhere
        break;
      case 'uncgpt:tts_mute': {
        // server-driven mute toggle (Mod Panel)
        window.__UNC_TTS_MUTED__ = !!msg.enabled;
        break;
      }
      case 'uncgpt:replay': {
        // server-driven replay
        const last = window.__unc_last__;
        if (last) {
          const { user, q, a, tier } = last;
          TTS.reset();
          TTS.enqueue(`${user} asks: ${normalizeQuestion(q)}`, 'question');
          if (a) TTS.enqueue(a, 'answer');
          if (tier === 'hype') triggerHype();
        }
        break;
      }
      default: break;
    }
  };
}
connect();

// ===== Debug hotkeys =====
// Shift+T -> test TTS; Shift+H -> hype glow
window.addEventListener('keydown', (e)=>{
  if(!e.shiftKey) return;
  const k=e.key.toLowerCase();
  if(k==='t'){ TTS.reset(); TTS.enqueue('TTS test hotkey', 'answer'); }
  if(k==='h'){ triggerHype(); }
});
