const BASE = '/api';

function extractInitDataFromLocation() {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('tgWebAppData');
    if (fromSearch) return decodeURIComponent(fromSearch);

    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const fromHash = new URLSearchParams(hash).get('tgWebAppData');
    if (fromHash) return decodeURIComponent(fromHash);
  } catch {
    // ignore parse issues
  }
  return '';
}

function getInitData() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.ready?.(); } catch {}
    if (tg.initData) return tg.initData;
  }

  if (window.__TG_INIT_DATA__) return String(window.__TG_INIT_DATA__);
  const fromLocation = extractInitDataFromLocation();
  if (fromLocation) {
    window.__TG_INIT_DATA__ = fromLocation;
    return fromLocation;
  }

  return '';
}

function mapApiError(message, fallback) {
  const text = String(message || fallback || 'Request failed');
  if (
    text.includes('Missing Telegram initData') ||
    text.includes('Telegram user missing in initData') ||
    text.includes('initData validation failed')
  ) {
    return 'Откройте мини-приложение через кнопку в Telegram-боте.';
  }
  return text;
}

async function readError(res, fallback) {
  try {
    const text = await res.text();
    if (!text) return mapApiError('', fallback);
    try {
      const json = JSON.parse(text);
      return mapApiError(json.error || json.message || text, fallback);
    } catch {
      return mapApiError(text, fallback);
    }
  } catch {
    return mapApiError('', fallback);
  }
}

function authHeaders(json = true, requireTelegram = false) {
  const headers = {};
  const initData = getInitData();

  if (requireTelegram && !initData) {
    throw new Error('Откройте мини-приложение через кнопку в Telegram-боте.');
  }

  if (initData) headers['X-Telegram-Init-Data'] = initData;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function buildIdempotencyKey(prefix = 'req') {
  try {
    if (window.crypto?.randomUUID) {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
  } catch {
    // no-op
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export async function fetchModels(userId) {
  const res = await fetch(`${BASE}/models?userId=${userId || ''}`, {
    headers: authHeaders(false, false),
  });
  const data = await res.json();
  return data.models || [];
}

export async function sendChat(userId, model, message) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: authHeaders(true, true),
    body: JSON.stringify({ userId, model, message }),
  });

  if (!res.ok) {
    throw new Error(await readError(res, 'Chat failed'));
  }

  return res.json();
}

export async function sendChatStream(userId, model, message, onChunk) {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: authHeaders(true, true),
    body: JSON.stringify({ userId, model, message }),
  });

  if (!res.ok) {
    throw new Error(await readError(res, 'Stream failed'));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.done) return;
        if (parsed.error) throw new Error(mapApiError(parsed.error));
        if (parsed.chunk) onChunk(parsed.chunk);
      } catch (e) {
        if (e.message !== 'done') throw e;
      }
    }
  }
}

export async function getUser(telegramId) {
  const res = await fetch(`${BASE}/user/${telegramId}`, { headers: authHeaders(false, true) });
  if (!res.ok) throw new Error(await readError(res, 'User request failed'));
  return res.json();
}

export async function saveByokKey(telegramId, provider, apiKey) {
  const res = await fetch(`${BASE}/user/${telegramId}/byok`, {
    method: 'POST',
    headers: authHeaders(true, true),
    body: JSON.stringify({ provider, apiKey }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Save key failed'));
  return res.json();
}

export async function deleteByokKey(telegramId, provider) {
  const res = await fetch(`${BASE}/user/${telegramId}/byok/${provider}`, {
    method: 'DELETE',
    headers: authHeaders(false, true),
  });
  if (!res.ok) throw new Error(await readError(res, 'Delete key failed'));
  return res.json();
}

export async function getSession(telegramId) {
  const res = await fetch(`${BASE}/session/${telegramId}`, { headers: authHeaders(false, true) });
  if (!res.ok) throw new Error(await readError(res, 'Session request failed'));
  return res.json();
}

export async function clearSession(telegramId) {
  const res = await fetch(`${BASE}/session/${telegramId}`, {
    method: 'DELETE',
    headers: authHeaders(false, true),
  });
  if (!res.ok) throw new Error(await readError(res, 'Session clear failed'));
  return res.json();
}

export async function billingPlans() {
  const res = await fetch(`${BASE}/billing/plans`, { headers: authHeaders(false, false) });
  if (!res.ok) throw new Error(await readError(res, 'Billing plans failed'));
  const data = await res.json();
  return data.plans || [];
}

export async function billingMe(telegramId) {
  const res = await fetch(`${BASE}/billing/me/${telegramId}`, {
    headers: authHeaders(false, true),
  });
  if (!res.ok) throw new Error(await readError(res, 'Billing me failed'));
  return res.json();
}

export async function billingCheckout(telegramId, planCode, provider = 'telegram_stars', metadata = {}) {
  const idempotencyKey = buildIdempotencyKey('checkout');
  const headers = {
    ...authHeaders(true, true),
    'X-Idempotency-Key': idempotencyKey,
  };

  const res = await fetch(`${BASE}/billing/checkout/${telegramId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ planCode, provider, metadata }),
  });

  if (!res.ok) throw new Error(await readError(res, 'Billing checkout failed'));
  return res.json();
}

export const api = {
  models: fetchModels,
  chat: sendChat,
  chatStream: sendChatStream,
  getUser,
  saveByokKey,
  deleteByokKey,
  getSession,
  clearSession,
  billingPlans,
  billingMe,
  billingCheckout,
};

export async function vaultSave(telegramId, category, data) {
  const res = await fetch(`${BASE}/vault/${telegramId}/${category}`, {
    method: 'POST',
    headers: authHeaders(true, true),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Vault save failed'));
  return res.json();
}

export async function vaultLoad(telegramId, category) {
  const res = await fetch(`${BASE}/vault/${telegramId}/${category}`, {
    headers: authHeaders(false, true),
  });
  if (!res.ok) throw new Error(await readError(res, 'Vault load failed'));
  return res.json();
}

export async function vaultList(telegramId) {
  const res = await fetch(`${BASE}/vault/${telegramId}`, { headers: authHeaders(false, true) });
  if (!res.ok) throw new Error(await readError(res, 'Vault list failed'));
  return res.json();
}

export async function vaultDelete(telegramId, category) {
  const res = await fetch(`${BASE}/vault/${telegramId}/${category}`, {
    method: 'DELETE',
    headers: authHeaders(false, true),
  });
  if (!res.ok) throw new Error(await readError(res, 'Vault delete failed'));
  return res.json();
}

api.vault = { save: vaultSave, load: vaultLoad, list: vaultList, delete: vaultDelete };

export async function health() {
  const res = await fetch(`${BASE}/health`, { headers: authHeaders(false, false) });
  if (!res.ok) throw new Error(await readError(res, 'Health failed'));
  return res.json();
}

api.health = health;
api.billing = { plans: billingPlans, me: billingMe, checkout: billingCheckout };
