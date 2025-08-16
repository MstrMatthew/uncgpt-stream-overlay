const ADMIN_TOKEN = '78yerssir69wearegonnadoit420nice'; // set this to the same value as in your .env
async function setVoice(v){
  await fetch(`/admin/tts/voice?voice=${encodeURIComponent(v)}`, { method:'PUT', headers:{ 'X-Admin-Token': ADMIN_TOKEN }});
}
async function setMute(on){
  await fetch(`/admin/tts/mute?enabled=${on?'true':'false'}`, { method:'PUT', headers:{ 'X-Admin-Token': ADMIN_TOKEN }});
}
async function replay(){
  await fetch(`/admin/overlay/replay`, { method:'POST', headers:{ 'X-Admin-Token': ADMIN_TOKEN }});
}

document.getElementById('setVoice').onclick = async ()=>{
  const v = document.getElementById('voice').value;
  await setVoice(v);
};
document.getElementById('muteTts').onchange = async (e)=> {
  await setMute(e.target.checked);
};
document.getElementById('replay').onclick = async ()=> {
  await replay();
};
const API = {
  add: async (payload)=> fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>r.json()),
  list: async ()=> fetch('/api/queue').then(r=>r.json()),
  stop: async (id)=> fetch(`/api/queue/${id}/stop`,{method:'POST'}).then(r=>r.json()),
  bump: async (id)=> fetch(`/api/queue/${id}/answer-now`,{method:'POST'}).then(r=>r.json())
};

const els = {
  form: document.getElementById('askForm'),
  user: document.getElementById('fUser'),
  q:    document.getElementById('fQ'),
  amt:  document.getElementById('fAmt'),
  src:  document.getElementById('fSrc'),
  body: document.getElementById('qBody')
};

async function refresh(){
  const { items } = await API.list();
  els.body.innerHTML = '';
  for (const it of items) {
    const tr = document.createElement('tr');

    const tdUser = document.createElement('td');
    tdUser.textContent = it.user;
    tr.appendChild(tdUser);

    const tdQ = document.createElement('td');
    tdQ.textContent = it.question;
    tr.appendChild(tdQ);

    const tdTier = document.createElement('td');
    tdTier.innerHTML = it.tier === 'hype'
      ? '<span class="pill hype">HYPE</span>'
      : '<span class="pill">free</span>';
    tr.appendChild(tdTier);

    const tdSrc = document.createElement('td');
    tdSrc.textContent = it.source + (it.amountCents ? ` (${it.amountCents}¢)` : '');
    tr.appendChild(tdSrc);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const bStop = document.createElement('button');
    bStop.textContent = 'Stop';
    bStop.onclick = async ()=>{ await API.stop(it.id); await refresh(); };
    const bNow = document.createElement('button');
    bNow.textContent = 'Answer Now';
    bNow.onclick = async ()=>{ await API.bump(it.id); await refresh(); };
    tdActions.append(bStop, bNow);
    tr.appendChild(tdActions);

    els.body.appendChild(tr);
  }
}

els.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    user: (els.user.value || 'Viewer').trim(),
    question: els.q.value.trim(),
    amountCents: Math.max(0, Number(els.amt.value||0)|0),
    source: els.src.value
  };
  if (!payload.question) return;
  await API.add(payload);
  els.q.value='';
  await refresh();
});

// WS to live-update
let ws=null, retry=null;
function connect(){
  try{ if(ws) ws.close(); }catch{}
  const scheme = location.protocol==='https:' ? 'wss':'ws';
  ws = new WebSocket(`${scheme}://${location.host}/ws`);
  ws.onopen = ()=>console.log('[ws] connected');
  ws.onclose = ()=>{ console.log('[ws] closed, retrying…'); clearTimeout(retry); retry=setTimeout(connect,1200); };
  ws.onerror = ()=>ws.close();
  ws.onmessage = (ev)=>{
    let msg=null; try{ msg=JSON.parse(ev.data); }catch{ return; }
    if (msg.type==='uncgpt:queue:update') refresh();
  };
}
connect();
refresh();

