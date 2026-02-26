import React, { useState } from 'react';

const TABS = ['overview', 'team', 'budget', 'usage'];

export default function BusinessPanel({ t, userId }) {
  const [tab, setTab] = useState('overview');
  const tabMeta = {
    overview: { icon: '📊', label: 'Overview' },
    team: { icon: '👥', label: 'Team' },
    budget: { icon: '💰', label: 'Budget' },
    usage: { icon: '📈', label: 'Usage' },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(id => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab === id ? 'bg-amber-500/15 text-amber-400' : 'text-white/30 hover:text-white/50 hover:bg-white/5'}`}>
              <span className="text-[11px]">{tabMeta[id].icon}</span>{tabMeta[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 gap-2.5">
              <Card icon="👥" label="Team members" value="—" color="amber" />
              <Card icon="💰" label="Monthly budget" value="—" color="emerald" />
              <Card icon="📊" label="Requests today" value="—" color="cyan" />
              <Card icon="🔑" label="API keys" value="—" color="purple" />
            </div>
            <div className="space-y-2">
              {['🏢 Organization profile', '📋 Activity feed', '🔔 Usage alerts', '📊 Cost analytics'].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'team' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">👥</div>
              <h3 className="text-lg font-semibold text-white/80">Team Management</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">Invite members, assign roles (Owner / Admin / Member), set per-user limits.</p>
            </div>
            <div className="space-y-2 mt-4">
              {['👤 Owner / Admin / Member roles', '📧 Invite via Telegram', '🔒 Per-user model restrictions', '📊 Per-user usage tracking', '🚫 Revoke access'].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'budget' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">💰</div>
              <h3 className="text-lg font-semibold text-white/80">Budget Control</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">Set monthly caps, per-user limits, get alerts before overspending.</p>
            </div>
            <div className="space-y-2 mt-4">
              {['📊 Monthly budget cap', '👤 Per-user daily limit', '⚠️ Alert at 80% usage', '🔒 Auto-pause at limit', '💳 Telegram Stars / TON / Cards'].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'usage' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">📈</div>
              <h3 className="text-lg font-semibold text-white/80">Usage Dashboard</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">Track costs by user, model, and time. Export reports.</p>
            </div>
            <div className="space-y-2 mt-4">
              {['📈 Requests per day chart', '💰 Cost by model breakdown', '👤 Top users by spend', '🤖 Most used models', '📋 Exportable logs (CSV)'].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon, label, value, color }) {
  const c = { amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/10', emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/10', cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/10', purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/10' };
  return (<div className={`rounded-xl bg-gradient-to-br ${c[color]} border p-3`}><div className="flex items-center justify-between"><span className="text-lg">{icon}</span><span className="text-lg font-bold text-white/80">{value}</span></div><p className="text-[10px] text-white/30 mt-1">{label}</p></div>);
}
