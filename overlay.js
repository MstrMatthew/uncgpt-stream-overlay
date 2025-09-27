(()=> {
  'use strict';

  // --- Timings & flags ---
  const DELAYS = {
    questionToAnswerMs: 1500,  // << shorter gap you asked for
    hypeGlowMs: 12000,
    clearAfterMs: 60000,
    minAfterAlertMs: 3000      // wait ~3s after alert starts
  };
  const USE_TTS_FOR = { question: true, answer: true };

  // --- Elements ---
  const el = {
    cta:    document.getElementById('cta'),
    user:   document.getElementById('ctaUser'),
    q:      document.getElementById('ctaQuestion'),
    a:      document.getElementById('ctaAnswer'),
    ticker: document.getElementById('ctaTicker'),
    sfx:    document.getElementById('sfx'),
    tts:    document.getElementById('tts'),
    gate:   document.getElementById('soundGate'),
  };

  // --- State ---
  const inbox = [];
  let processing = false;
  let lastEvent = null;
  let tickerTimer = null, tickerIdx = 0, tickerPaused = false;
  let clearDisplayTimer = null;

  // --- Utils ---
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const cleanQuestion = t => String(t || '').replace(/^asks:\s*/i, '').trim();
  function stopAudio(a){ try{ a.pause(); a.currentTime = 0; }catch{} }
  function setHypeGlow(on){
    el.cta.classList.toggle('hype-active', !!on);
    if (on) setTimeout(()=>el.cta.classList.remove('hype-active'), DELAYS.hypeGlowMs);
  }
  function cancelAutoClear(){ if (clearDisplayTimer) { clearTimeout(clearDisplayTimer); clearDisplayTimer = null; } }
  function scheduleAutoClear(){
    cancelAutoClear();
    clearDisplayTimer = setTimeout(()=>{
      el.user.textContent = '';
      el.q.textContent    = '';
      el.a.textContent    = '';
    }, DELAYS.clearAfterMs);
  }

  // --- Ticker rotation (pauses during speech) ---
  function startTicker(){
    if (!el.ticker) return;
    const msgs = [...el.ticker.querySelectorAll('.msg')];
    if (!msgs.length) return;
    msgs.forEach(m => m.classList.remove('active'));
    tickerIdx = 0; msgs[0].classList.add('active');
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(()=>{
      if (tickerPaused) return;
      msgs[tickerIdx].classList.remove('active');
      tickerIdx = (tickerIdx + 1) % msgs.length;
      msgs[tickerIdx].classList.add('active');
    }, 3500);
  }
  function pauseTicker(b){ tickerPaused = !!b; }
  startTicker();

  // --- Web Audio controller + autoplay gate (Safari-friendly) ---
  const AudioCtl = {
    ctx: null,
    ready: false,
    waiters: [],
    _installed: false,
    async ensure(){
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'running') { this.ready = true; this._flush(); this._hideGate(); return; }
      this._installUnlock(); this._showGate();
    },
    _installUnlock(){
      if (this._installed) return; this._installed = true;
      const tryResume = async ()=>{
        try{
          if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          await this.ctx.resume();
          // Safari warm-up: silent 10ms tone to fully unlock output
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          gain.gain.value = 0.0001;
          osc.connect(gain).connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.01);
        }catch{}
        if (this.ctx && this.ctx.state === 'running'){
          this.ready = true; this._flush(); this._hideGate();
          window.removeEventListener('pointerdown', tryResume);
          window.removeEventListener('keydown', tryResume);
          if (el.gate) el.gate.onclick = null;
        }
      };
      window.addEventListener('pointerdown', tryResume);
      window.addEventListener('keydown', tryResume);
      if (el.gate) el.gate.onclick = tryResume;
    },
    _showGate(){ if (el.gate) el.gate.style.display = 'block'; },
    _hideGate(){ if (el.gate) el.gate.style.display = 'none'; },
    waitUntilRunning(){
      if (this.ready && this.ctx && this.ctx.state === 'running') return Promise.resolve();
      this.ensure(); return new Promise(res => this.waiters.push(res));
    },
    _flush(){ const w = this.waiters.splice(0); w.forEach(fn => { try{ fn(); }catch{} }); },
    async playMp3ArrayBuffer(buf){
      await this.waitUntilRunning();
      // decodeAudioData returns a Promise in modern browsers; fallback if needed
      let abuf;
      try {
        abuf = await this.ctx.decodeAudioData(buf.slice(0));
      } catch {
        abuf = await new Promise((res, rej)=>{
          this.ctx.decodeAudioData(buf.slice(0), res, rej);
        });
      }
      await new Promise((resolve, reject)=>{
        try{
          const src = this.ctx.createBufferSource();
          src.buffer = abuf;
          src.connect(this.ctx.destination);
          src.onended = resolve;
          src.start(0);
        }catch(e){ reject(e); }
      });
    }
  };

  // Fallback data URL player (still no blob:)
  function arrayBufferToBase64(buffer){
    let binary = '', bytes = new Uint8Array(buffer), chunk = 0x8000;
    for (let i=0;i<bytes.length;i+=chunk){
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
    }
    return btoa(binary);
  }

  // --- Play alert, then wait until it really starts + >=3s/ended ---
  async function playAskSoundOnce(){
    try{
      await AudioCtl.waitUntilRunning();
      el.sfx.src = 'sounds/ask.mp3';
      el.sfx.currentTime = 0;

      // Wait until the audio actually enters playing state
      const whenPlaying = new Promise(res=>{
        if (!el.sfx.paused && !el.sfx.ended) return res();
        const onPlay = ()=>{ el.sfx.removeEventListener('playing', onPlay); res(); };
        el.sfx.addEventListener('playing', onPlay, { once: true });
      });

      // Kick off playback (promise resolves when it *starts*)
      await el.sfx.play().catch(()=>{});
      await whenPlaying.catch(()=>{});

      const t0 = performance.now();

      // Wait for (a) end or timeout, then (b) ensure >= minAfterAlertMs elapsed
      const endedOrTimeout = new Promise(res=>{
        const finish = ()=>{ el.sfx.onended = null; el.sfx.onpause = null; res(); };
        el.sfx.onended = finish;
        el.sfx.onpause = finish;
        setTimeout(res, 6000); // safety: cap overly long/looping files
      });
      await endedOrTimeout;

      const elapsed = performance.now() - t0;
      const remain = Math.max(0, DELAYS.minAfterAlertMs - elapsed);
      if (remain > 0) await delay(remain);

    }catch{}
  }

  // --- TTS fetch & play (no blob URLs) ---
  async function tts(text){
    try{
      await AudioCtl.waitUntilRunning();
      const res = await fetch(`/api/tts?q=${encodeURIComponent(text)}`, { cache: 'no-store' });
      if (!res.ok) return; // 204 if muted
      const buf = await res.arrayBuffer();
      try {
        await AudioCtl.playMp3ArrayBuffer(buf);
        return;
      } catch {
        // fallback to data URL
        el.tts.src = 'data:audio/mpeg;base64,' + arrayBufferToBase64(buf);
        await new Promise(resolve=>{
          const done = ()=>{ el.tts.onended = null; el.tts.onerror = null; resolve(); };
          el.tts.onended = done; el.tts.onerror = done;
          el.tts.play().catch(done);
        });
      }
    }catch{}
  }

  // --- Render helpers ---
  function renderQuestion(user, question, tier){
    cancelAutoClear();
    stopAudio(el.tts);
    el.user.textContent = user || 'Viewer';
    el.q.textContent    = question || '';
    el.a.textContent    = '';
    setHypeGlow(tier === 'hype');
  }
  function revealAnswer(answer){ el.a.textContent = answer || ''; }

  // --- Play one event fully ---
  async function playEvent(ev){
    const user = ev.user || 'Viewer';
    const q    = cleanQuestion(ev.question);
    const a    = ev.answer || '';
    const tier = ev.tier || 'free';
    lastEvent  = { user, question: q, answer: a, tier };

    pauseTicker(true);
    renderQuestion(user, q, tier);

    // 1) Alert sound first, then Question TTS
    await playAskSoundOnce();
    if (USE_TTS_FOR.question && q) await tts(`${user} asks: ${q}`);

    // 2) Shorter gap, then Answer TTS
    await delay(DELAYS.questionToAnswerMs);
    revealAnswer(a);
    if (USE_TTS_FOR.answer && a) await tts(a);

    pauseTicker(false);
    scheduleAutoClear();
  }

  async function drain(){ if (processing) return; processing = true; while (inbox.length){ await playEvent(inbox.shift()); } processing = false; }
  function enqueue(ev){ inbox.push(ev); drain(); }

  // --- WebSocket wiring ---
  function wsURL(){
    try {
      const u = new URL(location.href);
      u.protocol = u.protocol.replace('http', 'ws');
      u.pathname = '/ws'; u.search = ''; u.hash = '';
      return u.toString();
    } catch {
      return location.origin.replace(/^http/, 'ws') + '/ws';
    }
  }
  let ws = null;
  function connectWS(){
    try { if (ws) ws.close(); } catch {}
    ws = new WebSocket(wsURL());
    ws.onopen   = ()=>console.log('[ws] connected');
    ws.onclose  = ()=>{ console.log('[ws] closed; retrying…'); setTimeout(connectWS, 1500); };
    ws.onerror  = e => console.warn('[ws] error', e?.message || e);
    ws.onmessage = ev=>{
      let msg = null; try{ msg = JSON.parse(ev.data); }catch{ return; }
      if (!msg?.type) return;
      if (msg.type === 'uncgpt:answer') enqueue(msg);
      else if (msg.type === 'uncgpt:replay' && lastEvent) enqueue({ ...lastEvent });
    };
  }
  connectWS();

  // Show sound gate immediately if needed
  AudioCtl.ensure();
})();

