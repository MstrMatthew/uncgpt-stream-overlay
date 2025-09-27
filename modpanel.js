// modpanel.js — UncGPT Mod Panel client (Terminal drop-in)

(() => {
  const els = {
    voice: document.getElementById('voice'),
    setVoice: document.getElementById('setVoice'),
    muteTts: document.getElementById('muteTts'),
    replay: document.getElementById('replay'),
    askForm: document.getElementById('askForm'),
    fUser: document.getElementById('fUser'),
    fQ: document.getElementById('fQ'),
    fAmt: document.getElementById('fAmt'),
    fSrc: document.getElementById('fSrc'),
    qBody: document.getElementById('qBody')
  };

  let adminToken = localStorage.getItem('unc_admin_token') || '';
  if (!adminToken) {
    adminToken = prompt('Enter ADMIN_TOKEN (stored locally for this browser):') || '';
    if (adminToken) localStorage.setItem('unc_admin_token', adminToken);
  }

  function headersWithAdmin() {
    return { 'Content-Type': 'application/json', 'x-admin-token': adminToken || '' };
  }
  async function jsonFetch(url, opts={}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`${res.status} ${t}`);
    }
    return res.json().catch(()=> ({}));
  }

  els.setVoice.addEventListener('click', async () => {
    const v = (els.voice.value || '').trim();
    if (!v) return;
    try {
      await jsonFetch(`/admin/tts/voice?voice=${encodeURIComponent(v)}`, { method: 'PUT', headers: headersWithAdmin() });
      alert(`Voice set to ${v}`);
    } catch (e) { alert('Failed to set voice: ' + e.message); }
  });

  els.muteTts.addEventListener('change', async () => {
    const enabled = els.muteTts.checked ? 'true' : 'false';
    try {
      await jsonFetch(`/admin/tts/mute?enabled=${enabled}`, { method: 'PUT', headers: headersWithAdmin() });
    } catch (e) {
      alert('Failed to toggle TTS mute: ' + e.message);
      els.muteTts.checked = !els.muteTts.checked;
    }
  });

  els.replay.addEventListener('click', async () => {
    try { await jsonFetch(`/admin/overlay/replay`, { method: 'POST', headers: headersWithAdmin() }); }
    catch (e) { alert('Failed to replay: ' + e.message); }
  });

  els.askForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      user: (els.fUser.value || 'Viewer').trim(),
      question: (els.fQ.value || '').trim(),
      amountCents: Math.max(0, Number(els.fAmt.value || 0)),
      source: (els.fSrc.value || 'mod')
    };
    if (!body.question) return alert('Please enter a question');
    try {
      await jsonFetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      els.fQ.value = '';
    } catch (e) { alert('Failed to add to queue: ' + e.message); }
  });

  function renderQueue(items = []) {
    const fmtTier = (t, cents) => {
      const pill = (t === 'hype') ? 'pill hype' : 'pill';
      const dollars = (cents/100).toFixed(2);
      return `<span class="${pill}">${t.toUpperCase()}</span> <small>${dollars}</small>`;
    };
    const rows = items.map(x => {
      const q = String(x.question || '').replace(/^asks:\s*/i, '');
      return `
        <tr>
          <td>${x.user || 'Viewer'}</td>
          <td>${q}</td>
          <td>${fmtTier(x.tier, x.amountCents||0)}</td>
          <td>${x.source || ''}</td>
          <td class="actions">
            <button data-act="answer" data-id="${x.id}">Answer now</button>
            <button data-act="stop" data-id="${x.id}">Stop</button>
          </td>
        </tr>`;
    }).join('');
    document.getElementById('qBody').innerHTML = rows || '<tr><td colspan="5"><em>No queued items</em></td></tr>';
  }

  async function loadQueue() {
    try { const j = await jsonFetch('/api/queue'); renderQueue(j.items || []); } catch (e) {}
  }
  loadQueue();

  document.getElementById('qBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const id = btn.getAttribute('data-id'); const act = btn.getAttribute('data-act');
    if (!id) return;
    try {
      if (act === 'answer') await jsonFetch(`/api/queue/${encodeURIComponent(id)}/answer-now`, { method: 'POST' });
      if (act === 'stop')   await jsonFetch(`/api/queue/${encodeURIComponent(id)}/stop`, { method: 'POST' });
    } catch (err) { alert('Action failed: ' + err.message); }
  });

  function connectWS() {
    const url = (location.origin.replace(/^http/, 'ws') + '/ws');
    const ws = new WebSocket(url);
    ws.onopen = () => console.log('[ws] mod connected');
    ws.onclose = () => setTimeout(connectWS, 1500);
    ws.onmessage = (ev) => {
      let msg = null; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg?.type === 'uncgpt:queue:update') renderQueue(msg.items || []);
    };
  }
  connectWS();
})();
