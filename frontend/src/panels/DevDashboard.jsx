import React, { useState, useEffect } from 'react';
import { getUser, saveByokKey, deleteByokKey } from '../api';

const PROVIDERS = ['openrouter', 'huggingface'];

const API_DOCS = [
  { method: 'POST', path: '/api/chat', desc: '{ userId, model, message } → { response, model, provider }' },
  { method: 'GET', path: '/api/models', desc: '?userId=... → { models[] }' },
  { method: 'GET', path: '/api/user/:id', desc: '→ user profile & settings' },
  { method: 'POST', path: '/api/user/:id/byok', desc: '{ provider, apiKey } → save encrypted key' },
  { method: 'GET', path: '/api/session/:id', desc: '→ { messages[] }' },
  { method: 'DELETE', path: '/api/session/:id', desc: '→ clear chat history' },
];

export default function DevDashboard({ t, userId }) {
  const [activeKeys, setActiveKeys] = useState([]);
  const [newProvider, setNewProvider] = useState('openrouter');
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState('');

  useEffect(() => {
    loadUser();
  }, [userId]);

  const loadUser = async () => {
    try {
      const u = await getUser(userId);
      setActiveKeys(u.byokKeys || []);
    } catch {}
  };

  const handleSave = async () => {
    if (!newKey.trim()) return;
    setSaving(true);
    try {
      await saveByokKey(userId, newProvider, newKey.trim());
      setNewKey('');
      setShowSuccess(newProvider);
      setTimeout(() => setShowSuccess(''), 2000);
      await loadUser();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider) => {
    await deleteByokKey(userId, provider);
    await loadUser();
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white/90">{t.devPanel}</h2>
      </div>

      {/* BYOK Section */}
      <section className="rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-white/80">{t.byokTitle}</h3>
          <p className="text-xs text-white/30 mt-0.5">{t.byokDesc}</p>
        </div>

        {/* Active keys */}
        {activeKeys.length > 0 && (
          <div className="space-y-1.5">
            {activeKeys.map((prov) => (
              <div key={prov} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-mono text-white/70">{prov}</span>
                </div>
                <button
                  onClick={() => handleDelete(prov)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-all"
                >
                  {t.removeKey}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add key form */}
        <div className="space-y-2">
          <select
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-indigo-500/50"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p} className="bg-[#1a1a3e]">{p}</option>
            ))}
          </select>
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="sk-... or hf_..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 font-mono placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
          />
          <button
            onClick={handleSave}
            disabled={saving || !newKey.trim()}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-sm font-medium transition-all"
          >
            {saving ? '...' : showSuccess ? '✓ Saved!' : t.addKey}
          </button>
        </div>
      </section>

      {/* API Docs */}
      <section className="rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-white/80">{t.sdkTitle}</h3>
          <p className="text-xs text-white/30 mt-0.5">{t.sdkDesc}</p>
        </div>
        <div className="space-y-1.5">
          {API_DOCS.map((ep, i) => (
            <div key={i} className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  ep.method === 'GET' ? 'bg-emerald-500/15 text-emerald-400' :
                  ep.method === 'POST' ? 'bg-blue-500/15 text-blue-400' :
                  'bg-red-500/15 text-red-400'
                }`}>{ep.method}</span>
                <span className="text-xs font-mono text-white/60">{ep.path}</span>
              </div>
              <p className="text-[10px] text-white/30 mt-1 font-mono">{ep.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Webhook placeholder */}
      <section className="rounded-xl bg-white/[0.03] border border-white/5 p-4">
        <h3 className="text-sm font-medium text-white/80">{t.webhookTitle}</h3>
        <p className="text-xs text-white/30 mt-1">{t.webhookDesc}</p>
        <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-dashed border-white/10">
          <p className="text-xs text-white/20 font-mono text-center">Coming soon in v2</p>
        </div>
      </section>
    </div>
  );
}
