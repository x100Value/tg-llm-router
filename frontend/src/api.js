// api.js — Backend API wrapper
const BASE = '/api';

export async function fetchModels(userId) {
  const res = await fetch(`${BASE}/models?userId=${userId || ''}`);
  const data = await res.json();
  return data.models || [];
}

export async function sendChat(userId, model, message) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, model, message }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Chat request failed');
  }
  return res.json();
}

export async function getUser(telegramId) {
  const res = await fetch(`${BASE}/user/${telegramId}`);
  return res.json();
}

export async function saveByokKey(telegramId, provider, apiKey) {
  const res = await fetch(`${BASE}/user/${telegramId}/byok`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  });
  return res.json();
}

export async function deleteByokKey(telegramId, provider) {
  const res = await fetch(`${BASE}/user/${telegramId}/byok/${provider}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function getSession(telegramId) {
  const res = await fetch(`${BASE}/session/${telegramId}`);
  return res.json();
}

export async function clearSession(telegramId) {
  const res = await fetch(`${BASE}/session/${telegramId}`, { method: 'DELETE' });
  return res.json();
}
