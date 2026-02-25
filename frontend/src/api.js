const BASE = '/api';
function getInitData() { return window.Telegram?.WebApp?.initData || ''; }
function authHeaders(json=true) { const h = { 'X-Telegram-Init-Data': getInitData() }; if (json) h['Content-Type'] = 'application/json'; return h; }

export async function fetchModels(userId) { const res = await fetch(`${BASE}/models?userId=${userId||''}`, { headers: authHeaders(false) }); const data = await res.json(); return data.models || []; }

export async function sendChat(userId, model, message) { const res = await fetch(`${BASE}/chat`, { method:'POST', headers:authHeaders(), body:JSON.stringify({userId,model,message}) }); if (!res.ok) { const err = await res.json(); throw new Error(err.error||'Chat failed'); } return res.json(); }

export async function sendChatStream(userId, model, message, onChunk) {
  const res = await fetch(`${BASE}/chat/stream`, { method:'POST', headers:authHeaders(), body:JSON.stringify({userId,model,message}) });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error||'Stream failed'); }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const j = JSON.parse(line.slice(6));
        if (j.done) return;
        if (j.error) throw new Error(j.error);
        if (j.chunk) onChunk(j.chunk);
      } catch(e) { if (e.message !== 'done') throw e; }
    }
  }
}

export async function getUser(tid) { const r = await fetch(`${BASE}/user/${tid}`, { headers:authHeaders(false) }); return r.json(); }
export async function saveByokKey(tid, provider, apiKey) { const r = await fetch(`${BASE}/user/${tid}/byok`, { method:'POST', headers:authHeaders(), body:JSON.stringify({provider,apiKey}) }); return r.json(); }
export async function deleteByokKey(tid, provider) { const r = await fetch(`${BASE}/user/${tid}/byok/${provider}`, { method:'DELETE', headers:authHeaders(false) }); return r.json(); }
export async function getSession(tid) { const r = await fetch(`${BASE}/session/${tid}`, { headers:authHeaders(false) }); return r.json(); }
export async function clearSession(tid) { const r = await fetch(`${BASE}/session/${tid}`, { method:'DELETE', headers:authHeaders(false) }); return r.json(); }

export const api = { models: fetchModels, chat: sendChat, chatStream: sendChatStream, getUser, saveByokKey, deleteByokKey, getSession, clearSession };

// Vault (E2E encrypted storage)
export async function vaultSave(telegramId, category, data) {
  const r = await fetch(`${BASE}/vault/${telegramId}/${category}`, { method:'POST', headers:authHeaders(), body:JSON.stringify({data}) }); return r.json();
}
export async function vaultLoad(telegramId, category) {
  const r = await fetch(`${BASE}/vault/${telegramId}/${category}`, { headers:authHeaders(false) }); return r.json();
}
export async function vaultList(telegramId) {
  const r = await fetch(`${BASE}/vault/${telegramId}`, { headers:authHeaders(false) }); return r.json();
}
export async function vaultDelete(telegramId, category) {
  const r = await fetch(`${BASE}/vault/${telegramId}/${category}`, { method:'DELETE', headers:authHeaders(false) }); return r.json();
}

api.vault = { save: vaultSave, load: vaultLoad, list: vaultList, delete: vaultDelete };

export async function health() { const r = await fetch(`${BASE}/health`, { headers:authHeaders(false) }); return r.json(); }
api.health = health;
