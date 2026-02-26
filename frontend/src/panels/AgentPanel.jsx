import React, { useState, useEffect } from 'react';
import { api } from '../api';

const TABS = ['dashboard', 'agents', 'orchestrator', 'marketplace'];

export default function AgentPanel({ t, userId }) {
  const [tab, setTab] = useState('dashboard');
  const [models, setModels] = useState([]);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.models(userId).then(setModels).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, [userId]);

  const tabMeta = {
    dashboard: { icon: '📊', label: t.agentsDashboard || 'Dashboard' },
    agents: { icon: '🤖', label: t.myAgents || 'Agents' },
    orchestrator: { icon: '🔗', label: t.orchestrator || 'Chain' },
    marketplace: { icon: '🏪', label: t.marketplace || 'Market' },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(id => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab === id ? 'bg-purple-500/15 text-purple-400' : 'text-white/30 hover:text-white/50 hover:bg-white/5'}`}>
              <span className="text-[11px]">{tabMeta[id].icon}</span>{tabMeta[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'dashboard' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label={t.models || 'Models'} value={models.length} icon="🧠" color="purple" />
              <StatCard label={t.activeAgents || 'Agents'} value="0" icon="🤖" color="cyan" />
              <StatCard label="Uptime" value={health ? `${Math.floor(health.uptime/3600)}h` : '-'} icon="⏱" color="green" />
              <StatCard label={t.provider || 'Providers'} value="2" icon="🔌" color="amber" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">{t.models || 'Models'}</h3>
              <div className="space-y-1.5">{models.slice(0,6).map(m => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                  <span className={`w-1.5 h-1.5 rounded-full ${m.status==='available'?'bg-emerald-400':'bg-red-400'}`} />
                  <span className="text-xs font-mono text-white/60 truncate flex-1">{m.name}</span>
                  <span className="text-[9px] text-white/20">{m.provider}</span>
                </div>
              ))}</div>
            </div>
          </div>
        )}
        {tab === 'agents' && (
          <div className="px-4 py-5 animate-fade-in space-y-4">
            <div className="rounded-2xl bg-surface-2 border border-white/5 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white/80">{t.createAgent || 'Create Agent'}</h3>
              <input placeholder="Agent name" className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 placeholder-white/20 focus:outline-none" />
              <select className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 focus:outline-none">
                {models.map(m => <option key={m.id} value={m.id} className="bg-surface-1">{m.name}</option>)}
              </select>
              <textarea placeholder="System prompt..." rows={3} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 placeholder-white/20 focus:outline-none resize-none" />
              <button className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium opacity-50 cursor-not-allowed">
                Create — {t.comingSoon || 'Coming soon'}
              </button>
            </div>
            {/* Planned features */}
            <div className="space-y-2">
              {['🔄 Auto-retry on failure', '📋 Execution logs', '⏰ Scheduled runs', '🔌 Tool integrations (web, code, files)'].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'orchestrator' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">🔗</div>
              <h3 className="text-lg font-semibold text-white/80">{t.orchestrator || 'Orchestrator'}</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">Chain multiple agents together. Agent A analyzes → Agent B writes → Agent C reviews.</p>
            </div>
            <div className="space-y-2 mt-6">
              {['Agent → Agent chains', 'Conditional routing', 'Parallel execution', 'Result aggregation', 'Visual flow builder'].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">🔹 {f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'marketplace' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">🏪</div>
              <h3 className="text-lg font-semibold text-white/80">{t.marketplace || 'Marketplace'}</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">Buy & sell AI prompts, personas and agent templates. Earn from your creations.</p>
            </div>
            {/* Preview cards */}
            <div className="space-y-2.5 mt-4">
              {[
                { icon: '👨‍💻', name: 'Fullstack Debugger', author: 'x100', price: '⭐ 50', desc: 'Expert code reviewer & debugger' },
                { icon: '📝', name: 'Content Writer Pro', author: 'community', price: '⭐ 30', desc: 'SEO-optimized blog posts' },
                { icon: '🌐', name: 'Universal Translator', author: 'x100', price: 'Free', desc: '50+ languages with context' },
                { icon: '📊', name: 'Data Analyst', author: 'community', price: '⭐ 75', desc: 'CSV/JSON analysis & insights' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-2 border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-xs font-semibold text-white/70">{item.name}</span><span className="text-[9px] text-white/20">by {item.author}</span></div>
                    <p className="text-[10px] text-white/30 mt-0.5">{item.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400/60 bg-amber-500/10 px-2 py-0.5 rounded-full flex-shrink-0">{item.price}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-[10px] text-white/15 mt-6">Marketplace launches with TON & Stars payments</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const c = { purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/10', cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/10', green: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/10', amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/10' };
  return (<div className={`rounded-xl bg-gradient-to-br ${c[color]} border p-3`}><div className="flex items-center justify-between"><span className="text-lg">{icon}</span><span className="text-lg font-bold text-white/80">{value}</span></div><p className="text-[10px] text-white/30 mt-1">{label}</p></div>);
}
