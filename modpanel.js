function getAdminToken(){ return localStorage.getItem('adminToken') || ''; }
function setAdminToken(t){ localStorage.setItem('adminToken', t||''); }

async function call(method, path){
  const res = await fetch(path, { method, headers: { 'X-Admin-Token': getAdminToken() }});
  if (!res.ok) throw new Error("HTTP "+res.status);
  try { return await res.json(); } catch { return {}; }
}

const API = {
  list:   ()=> call('GET',  '/admin/queue/list'),
  bump:   (id)=> call('PUT', '/admin/queue/bump?id='+encodeURIComponent(id)),
  ignore: (id)=> call('PUT', '/admin/queue/ignore?id='+encodeURIComponent(id)),
  force:  (id)=> call('PUT', '/admin/queue/force?id='+encodeURIComponent(id)),
  ask:    (body)=> fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()),
  mute:   (on)=> call('PUT', '/admin/tts/mute?enabled='+(on?'true':'false')),
  voice:  (v)=> call('PUT', '/admin/tts/voice?voice='+encodeURIComponent(v)),
  replay: ()=> call('POST','/admin/overlay/replay')
};

const els = {
  form: document.getElementById('askForm'),
  user: document.getElementById('fUser'),
  q:    document.getElementById('fQ'),
  amt:  document.getElementById('fAmt'),
  src:  document.getElementById('fSrc'),
  body: document.getElementById('qBody'),
  tok:  document.getElementById('adminToken'),
  mute: document.getElementById('muteTts'),
  voice:document.getElementById('voice')
};

if (els.tok) els.tok.value = getAdminToken();

document.getElementById('saveToken')?.addEventListener('click', ()=>{
  const v = els.tok.value.trim();
  setAdminToken(v); refresh();
});
document.getElementById('replay')?.addEventListener('click', ()=> API.replay().catch(()=>{}));
document.getElementById('setVoice')?.addEventListener('click', ()=> API.voice(els.voice.value).catch(()=>{}));
els.mute?.addEventListener('change', (e)=> API.mute(!!e.target.checked).catch(()=>{}));

if (els.form) els.form.onsubmit = async (e)=>{
  e.preventDefault();
  const payload = {
    user: els.user.value || 'Viewer',
    question: els.q.value || '',
    amountCents: Number(els.amt.value||0),
    source: els.src.value || 'mod'
  };
  await API.ask(payload).catch(()=>{});
  els.q.value=''; refresh();
};

function pill(tier){
  if (tier==='hype') return '<span class="pill hype">HYPE</span>';
  if (tier==='free') return '<span class="pill">FREE</span>';
  return '';
}

async function refresh(){
  try {
    const { items=[] } = await API.list();
    if (!els.body) return;
    els.body.innerHTML = '';
    for (const it of items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.user||'Viewer'}</td>
        <td>${String(it.question||'').replace(/^asks:\s*/i,'')}</td>
        <td>${pill(it.tier)}</td>
        <td>${it.status||''}</td>
        <td>${it.source||''}</td>
        <td class="actions">
          <button data-id="${it.id}" data-act="force">Force</button>
          <button data-id="${it.id}" data-act="bump">Bump</button>
          <button data-id="${it.id}" data-act="ignore">Ignore</button>
        </td>
      `;
      els.body.appendChild(tr);
    }
    els.body.querySelectorAll('button').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        try {
          if (act==='force') await API.force(id);
          else if (act==='bump') await API.bump(id);
          else if (act==='ignore') await API.ignore(id);
        } catch {}
        refresh();
      };
    });
  } catch {}
}

refresh();
