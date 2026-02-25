import React, { useState, useEffect } from 'react';
import { api } from '../api';
import Stub from '../components/Stub';

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
    dashboard: { icon: '📊', label: t.agentsDashboard },
    agents: { icon: '🤖', label: t.myAgents },
    orchestrator: { icon: '🔗', label: t.orchestrator },
    marketplace: { icon: '🏪', label: t.marketplace },
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
                tab === id ? 'bg-purple-500/15 text-purple-400' : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
            >
              <span className="text-[11px]">{tabMeta[id].icon}</span>
              {tabMeta[id].label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'dashboard' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label={t.models} value={models.length} icon="🧠" color="purple" />
              <StatCard label={t.activeAgents} value="0" icon="🤖" color="cyan" />
              <StatCard label="Uptime" value={health ? `${Math.floor(health.uptime / 3600)}h` : '-'} icon="⏱" color="green" />
              <StatCard label={t.provider} value="2" icon="🔌" color="amber" />
            </div>

            {/* Models overview */}
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">{t.models}</h3>
              <div className="space-y-1.5">
                {models.slice(0, 6).map(m => (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                    <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'available' ? 'bg-neon-green status-online' : 'bg-neon-red'}`} />
                    <span className="text-xs font-mono text-white/60 truncate flex-1">{m.name}</span>
                    <span className="text-[9px] text-white/20">{m.provider}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions — STUBS */}
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <QuickAction icon="➕" label={t.createAgent} sub={t.stub} />
                <QuickAction icon="📋" label={t.agentLogs} sub={t.stub} />
                <QuickAction icon="📈" label={t.agentMetrics} sub={t.stub} />
                <QuickAction icon="🔧" label={t.settings} sub={t.stub} />
              </div>
            </div>
          </div>
        )}

        {tab === 'agents' && (
          <div className="px-4 py-5 animate-fade-in">
            {/* Create agent form — STUB */}
            <div className="rounded-2xl bg-surface-2 border border-white/5 p-4 space-y-3 mb-4">
              <h3 className="text-sm font-semibold text-white/80">{t.createAgent}</h3>
              <input placeholder={t.agentName} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 placeholder-white/20 focus:outline-none focus:border-purple-500/40" />
              <select className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 focus:outline-none">
                {models.map(m => <option key={m.id} value={m.id} className="bg-surface-1">{m.name}</option>)}
              </select>
              <textarea placeholder={t.agentPrompt} rows={3} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 placeholder-white/20 focus:outline-none focus:border-purple-500/40 resize-none" />
              <button className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all opacity-50 cursor-not-allowed">
                {t.createAgent} — {t.comingSoon}
              </button>
            </div>

            {/* Agent list — empty state */}
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-2xl mb-3">🤖</div>
              <p className="text-sm text-white/30">{t.stub}</p>
              <p className="text-xs text-white/15 mt-1">{t.stubDesc}</p>
            </div>
          </div>
        )}

        {tab === 'orchestrator' && (
          <Stub icon="🔗" title={t.orchestrator} description={t.orchestratorDesc + ' — ' + t.stubDesc} t={t} />
        )}

        {tab === 'marketplace' && (
          <Stub icon="🏪" title={t.marketplace} description={t.marketplaceDesc + ' — ' + t.stubDesc} t={t} />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colors = {
    purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/10',
    cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/10',
    green: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/10',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/10',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${colors[color]} border p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-lg">{icon}</span>
        <span className="text-lg font-bold text-white/80">{value}</span>
      </div>
      <p className="text-[10px] text-white/30 mt-1">{label}</p>
    </div>
  );
}

function QuickAction({ icon, label, sub }) {
  return (
    <button className="rounded-xl bg-surface-2 border border-white/5 p-3 text-left hover:border-white/10 transition-all card-hover">
      <span className="text-lg">{icon}</span>
      <p className="text-xs text-white/60 mt-1 font-medium">{label}</p>
      <p className="text-[9px] text-white/20 mt-0.5">{sub}</p>
    </button>
  );
}
