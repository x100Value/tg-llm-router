import React, { useState, useEffect } from 'react';

const ROLES = [
  { id: 'user', icon: '💬', gradient: 'from-emerald-500 to-green-600', glow: 'rgba(34,197,94,0.15)', tKey: 'roleUser', descKey: 'roleUserDesc' },
  { id: 'business', icon: '🏢', gradient: 'from-amber-500 to-orange-600', glow: 'rgba(245,158,11,0.15)', tKey: 'roleBusiness', descKey: 'roleBusinessDesc' },
  { id: 'agent', icon: '🤖', gradient: 'from-purple-500 to-indigo-600', glow: 'rgba(139,92,246,0.15)', tKey: 'roleAgent', descKey: 'roleAgentDesc' },
  { id: 'dev', icon: '⌨️', gradient: 'from-cyan-500 to-blue-600', glow: 'rgba(6,182,212,0.15)', tKey: 'roleDev', descKey: 'roleDevDesc' },
];

export default function RoleSelect({ t, onSelect }) {
  const [stats, setStats] = useState({ total: 0, unique: 0 });
  useEffect(() => {
    const tid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anon';
    fetch('/api/stats/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramId: String(tid) }) })
      .then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 noise">
      <div className="mb-6 animate-fade-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center mb-3"><span className="text-xl">⚡</span></div>
        <h1 className="text-xl font-bold text-center"><span className="text-gradient">LLM Router</span></h1>
        <p className="text-xs text-white/30 text-center mt-1">{t.chooseRoleDesc}</p>
      </div>
      <div className="w-full max-w-sm space-y-2.5 animate-slide-up">
        {ROLES.map((role, i) => (
          <button key={role.id} onClick={() => onSelect(role.id)} className="w-full group relative overflow-hidden rounded-2xl bg-surface-2 border border-white/5 p-4 text-left transition-all duration-300 hover:border-white/10 card-hover" style={{ animationDelay: `${i*60}ms`, boxShadow: `0 0 30px ${role.glow}` }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center text-lg flex-shrink-0`}>{role.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-white/90">{t[role.tKey] || role.id}</h3>
                <p className="text-[11px] text-white/35 mt-0.5">{t[role.descKey] || ''}</p>
              </div>
              <svg className="w-4 h-4 text-white/15 group-hover:text-white/30 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-6 text-white/20">
        <div className="flex items-center gap-1.5"><span className="text-base">👤</span><span className="text-xs font-mono">{stats.unique}</span></div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-1.5"><span className="text-base">👁</span><span className="text-xs font-mono">{stats.total}</span></div>
      </div>
      <p className="mt-3 text-[10px] text-white/15 font-mono">v2.1.0</p>
    </div>
  );
}
