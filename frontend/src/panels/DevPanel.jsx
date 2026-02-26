import React, { useState, useEffect } from 'react';
import { api } from '../api';

const TABS = ['keys', 'docs', 'playground', 'usage'];
const PROVIDERS = ['openrouter', 'huggingface'];
const API_ENDPOINTS = [
  { m: 'POST', p: '/api/chat', d: '{ userId, model, message } → { response }' },
  { m: 'POST', p: '/api/chat/stream', d: 'SSE streaming response' },
  { m: 'GET', p: '/api/models', d: '?userId=... → { models[] }' },
  { m: 'GET', p: '/api/user/:id', d: '→ user profile' },
  { m: 'POST', p: '/api/user/:id/byok', d: '{ provider, apiKey }' },
  { m: 'DELETE', p: '/api/user/:id/byok/:prov', d: '→ remove key' },
  { m: 'GET', p: '/api/session/:id', d: '→ { messages[] }' },
  { m: 'DELETE', p: '/api/session/:id', d: '→ clear session' },
  { m: 'GET', p: '/api/health', d: '→ { status, uptime }' },
  { m: 'GET', p: '/api/stats', d: '→ { total, unique }' },
];

export default function DevPanel({ t, userId }) {
  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [provider, setProvider] = useState('openrouter');
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Playground state
  const [pgModel, setPgModel] = useState('');
  const [pgModels, setPgModels] = useState([]);
  const [pgInput, setPgInput] = useState('');
  const [pgResult, setPgResult] = useState(null);
  const [pgLoading, setPgLoading] = useState(false);
  // Usage state
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => { loadKeys(); loadModels(); }, [userId]);

  const loadKeys = async () => { try { const u = await api.getUser(userId); setKeys(u.byokKeys || []); } catch {} };
  const loadModels = async () => { try { const m = await api.models(userId); setPgModels(m); if (m.length) setPgModel(m[0].id); } catch {} };

  const saveKey = async () => {
    if (!newKey.trim()) return;
    setSaving(true);
    await api.saveByokKey(userId, provider, newKey.trim());
    setNewKey(''); setSaved(true); setTimeout(() => setSaved(false), 2000);
    await loadKeys(); setSaving(false);
  };
  const deleteKey = async (prov) => { await api.deleteByokKey(userId, prov); await loadKeys(); };

  const runPlayground = async () => {
    if (!pgInput.trim()) return;
    setPgLoading(true); setPgResult(null);
    const start = Date.now();
    try {
      const res = await api.chat(userId, pgModel, pgInput.trim());
      setPgResult({ ok: true, response: res.response, model: res.model, provider: res.provider, fallback: res.fallback, ms: Date.now() - start });
    } catch (e) { setPgResult({ ok: false, error: e.message, ms: Date.now() - start }); }
    setPgLoading(false);
  };

  const loadUsage = async () => {
    try { const [s, h] = await Promise.all([fetch('/api/stats').then(r=>r.json()), api.health()]); setStats(s); setHealth(h); } catch {}
  };
  useEffect(() => { if (tab === 'usage') loadUsage(); }, [tab]);

  const tabMeta = { keys: { icon: '🔑', label: t.apiKeys }, docs: { icon: '📖', label: t.apiDocs || 'API' }, playground: { icon: '🧪', label: t.playground || 'Test' }, usage: { icon: '📊', label: t.usage || 'Usage' } };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(id => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab === id ? 'bg-cyan-500/15 text-cyan-400' : 'text-white/30 hover:text-white/50 hover:bg-white/5'}`}>
              <span className="text-[11px]">{tabMeta[id].icon}</span>{tabMeta[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'keys' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">{t.byokTitle}</h3><p className="text-xs text-white/30 mt-0.5">{t.byokDesc}</p></div>
            {keys.length > 0 && <div className="space-y-1.5">{keys.map(k => (
              <div key={k} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-neon-green" /><span className="text-xs font-mono text-white/60">{k}</span></div>
                <button onClick={() => deleteKey(k)} className="text-[10px] text-red-400/50 hover:text-red-400">{t.removeKey}</button>
              </div>
            ))}</div>}
            <div className="rounded-2xl bg-surface-2 border border-white/5 p-4 space-y-2.5">
              <select value={provider} onChange={e => setProvider(e.target.value)} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 focus:outline-none">{PROVIDERS.map(p => <option key={p} value={p} className="bg-surface-1">{p}</option>)}</select>
              <input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-... or hf_..." className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 font-mono placeholder-white/15 focus:outline-none" />
              <button onClick={saveKey} disabled={saving || !newKey.trim()} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-25 text-white text-sm font-medium transition-all">{saved ? '✓' : saving ? '...' : t.addKey}</button>
            </div>
          </div>
        )}
        {tab === 'docs' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">REST API</h3><p className="text-xs text-white/30 mt-0.5">Base: https://routertext.ru</p></div>
            <div className="space-y-1.5">{API_ENDPOINTS.map((ep, i) => (
              <div key={i} className="px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${ep.m==='GET'?'bg-emerald-500/10 text-emerald-400':ep.m==='POST'?'bg-blue-500/10 text-blue-400':'bg-red-500/10 text-red-400'}`}>{ep.m}</span>
                  <span className="text-xs font-mono text-white/50">{ep.p}</span>
                </div>
                <p className="text-[10px] text-white/20 font-mono mt-1">{ep.d}</p>
              </div>
            ))}</div>
            <div className="rounded-2xl bg-surface-2 border border-dashed border-white/10 p-4 text-center"><p className="text-xs text-white/25">NPM SDK — Coming soon</p></div>
          </div>
        )}
        {tab === 'playground' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">⚡ API Playground</h3><p className="text-xs text-white/30 mt-0.5">{t.playgroundDesc || 'Test models directly'}</p></div>
            <select value={pgModel} onChange={e => setPgModel(e.target.value)} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 font-mono focus:outline-none">
              {pgModels.map(m => <option key={m.id} value={m.id} className="bg-surface-1">{m.name}</option>)}
            </select>
            <textarea value={pgInput} onChange={e => setPgInput(e.target.value)} placeholder="Enter prompt..." rows={3} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 placeholder-white/15 focus:outline-none resize-none" />
            <button onClick={runPlayground} disabled={pgLoading || !pgInput.trim()} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-25 text-white text-sm font-medium transition-all">
              {pgLoading ? '⏳ Running...' : '⚡ Send Request'}
            </button>
            {pgResult && (
              <div className={`rounded-xl p-3 text-sm ${pgResult.ok ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                {pgResult.ok ? (
                  <><p className="text-white/80 text-xs whitespace-pre-wrap">{pgResult.response}</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-white/30"><span>📡 {pgResult.provider}</span><span>⏱ {pgResult.ms}ms</span><span>🤖 {pgResult.model}</span>{pgResult.fallback && <span className="text-amber-400">⚡ fallback</span>}</div></>
                ) : <p className="text-red-300 text-xs">❌ {pgResult.error} ({pgResult.ms}ms)</p>}
              </div>
            )}
          </div>
        )}
        {tab === 'usage' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">📊 Usage & Metrics</h3></div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/10 p-3">
                <span className="text-lg">👤</span><span className="text-lg font-bold text-white/80 ml-2">{stats?.unique || 0}</span>
                <p className="text-[10px] text-white/30 mt-1">Unique users</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/10 p-3">
                <span className="text-lg">👁</span><span className="text-lg font-bold text-white/80 ml-2">{stats?.total || 0}</span>
                <p className="text-[10px] text-white/30 mt-1">Total visits</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/10 p-3">
                <span className="text-lg">💬</span><span className="text-lg font-bold text-white/80 ml-2">{health?.activeSessions || 0}</span>
                <p className="text-[10px] text-white/30 mt-1">Active sessions</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/10 p-3">
                <span className="text-lg">⏱</span><span className="text-lg font-bold text-white/80 ml-2">{health ? Math.floor(health.uptime/3600)+'h' : '-'}</span>
                <p className="text-[10px] text-white/30 mt-1">Uptime</p>
              </div>
            </div>
            {/* Future metrics */}
            <div className="space-y-2">
              {['💰 Token costs per model', '📈 Requests per day chart', '🏆 Top models by usage', '⚠️ Error rate tracking'].map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{item}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">{t.comingSoon || 'Soon'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
