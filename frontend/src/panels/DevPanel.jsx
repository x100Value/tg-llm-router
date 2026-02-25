import React, { useState, useEffect } from 'react';
import { api } from '../api';
import Stub from '../components/Stub';

const TABS = ['keys', 'docs', 'playground', 'usage'];
const PROVIDERS = ['openrouter', 'huggingface'];

const API_ENDPOINTS = [
  { m: 'POST', p: '/api/chat', d: '{ userId, model, message } → { response, model, provider, fallback }' },
  { m: 'GET', p: '/api/models', d: '?userId=... → { models[] }' },
  { m: 'GET', p: '/api/user/:id', d: '→ user profile & settings' },
  { m: 'POST', p: '/api/user/:id/byok', d: '{ provider, apiKey } → encrypted storage' },
  { m: 'DELETE', p: '/api/user/:id/byok/:prov', d: '→ remove BYOK key' },
  { m: 'GET', p: '/api/session/:id', d: '→ { messages[] }' },
  { m: 'DELETE', p: '/api/session/:id', d: '→ clear session' },
  { m: 'GET', p: '/api/health', d: '→ { status, uptime, stats }' },
];

const CURL_EXAMPLE = `curl -X POST https://routertext.ru/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"123","model":"openrouter:meta-llama/llama-3.1-8b-instruct:free","message":"Hello!"}'`;

export default function DevPanel({ t, userId }) {
  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [provider, setProvider] = useState('openrouter');
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadKeys(); }, [userId]);

  const loadKeys = async () => {
    try {
      const u = await api.user(userId);
      setKeys(u.byokKeys || []);
    } catch {}
  };

  const saveKey = async () => {
    if (!newKey.trim()) return;
    setSaving(true);
    await api.saveBYOK(userId, provider, newKey.trim());
    setNewKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await loadKeys();
    setSaving(false);
  };

  const deleteKey = async (prov) => {
    await api.deleteBYOK(userId, prov);
    await loadKeys();
  };

  const tabMeta = {
    keys: { icon: '🔑', label: t.apiKeys },
    docs: { icon: '📖', label: t.apiDocs },
    playground: { icon: '🧪', label: t.playground },
    usage: { icon: '📊', label: t.usage },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Sub-tabs */}
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(id => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab === id ? 'bg-cyan-500/15 text-cyan-400' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
            >
              <span className="text-[11px]">{tabMeta[id].icon}</span>
              {tabMeta[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* BYOK Keys */}
        {tab === 'keys' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div>
              <h3 className="text-sm font-semibold text-white/80">{t.byokTitle}</h3>
              <p className="text-xs text-white/30 mt-0.5">{t.byokDesc}</p>
            </div>

            {/* Active keys */}
            {keys.length > 0 && (
              <div className="space-y-1.5">
                {keys.map(k => (
                  <div key={k} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-neon-green status-online" />
                      <span className="text-xs font-mono text-white/60">{k}</span>
                    </div>
                    <button onClick={() => deleteKey(k)} className="text-[10px] text-neon-red/50 hover:text-neon-red transition-all">{t.removeKey}</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add key */}
            <div className="rounded-2xl bg-surface-2 border border-white/5 p-4 space-y-2.5">
              <select
                value={provider}
                onChange={e => setProvider(e.target.value)}
                className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-cyan-500/40"
              >
                {PROVIDERS.map(p => <option key={p} value={p} className="bg-surface-1">{p}</option>)}
              </select>
              <input
                type="password"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="sk-... or hf_..."
                className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 font-mono placeholder-white/15 focus:outline-none focus:border-cyan-500/40"
              />
              <button
                onClick={saveKey}
                disabled={saving || !newKey.trim()}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-25 text-white text-sm font-medium transition-all"
              >
                {saved ? '✓ Saved!' : saving ? '...' : t.addKey}
              </button>
            </div>
          </div>
        )}

        {/* API Docs */}
        {tab === 'docs' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div>
              <h3 className="text-sm font-semibold text-white/80">{t.apiDocs}</h3>
              <p className="text-xs text-white/30 mt-0.5">REST API · Base URL: https://routertext.ru</p>
            </div>

            {/* Endpoints */}
            <div className="space-y-1.5">
              {API_ENDPOINTS.map((ep, i) => (
                <div key={i} className="px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      ep.m === 'GET' ? 'bg-neon-green/10 text-neon-green' :
                      ep.m === 'POST' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-neon-red/10 text-neon-red'
                    }`}>{ep.m}</span>
                    <span className="text-xs font-mono text-white/50">{ep.p}</span>
                  </div>
                  <p className="text-[10px] text-white/20 font-mono mt-1">{ep.d}</p>
                </div>
              ))}
            </div>

            {/* cURL example */}
            <div>
              <h4 className="text-xs font-medium text-white/50 mb-2">Example</h4>
              <div className="rounded-xl bg-surface-3 border border-white/5 p-3 overflow-x-auto">
                <pre className="text-[10px] text-cyan-400/70 font-mono whitespace-pre">{CURL_EXAMPLE}</pre>
              </div>
            </div>

            {/* SDK placeholder */}
            <div className="rounded-2xl bg-surface-2 border border-dashed border-white/10 p-4 text-center">
              <p className="text-xs text-white/25">NPM package & SDK — {t.comingSoon}</p>
            </div>
          </div>
        )}

        {/* Playground — STUB */}
        {tab === 'playground' && (
          <Stub icon="🧪" title={t.playground} description={t.playgroundDesc + ' — ' + t.stubDesc} t={t} />
        )}

        {/* Usage — STUB */}
        {tab === 'usage' && (
          <Stub icon="📊" title={t.usage} description={t.usageDesc + ' — ' + t.stubDesc} t={t} />
        )}
      </div>
    </div>
  );
}
