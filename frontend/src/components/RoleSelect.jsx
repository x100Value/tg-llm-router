import React, { useState, useEffect } from 'react';

const ROLES = [
  { id: 'agent', icon: '🧪', gradient: 'from-purple-500 to-indigo-600', glow: 'rgba(139,92,246,0.15)', tKey: 'roleAgent', descKey: 'roleAgentDesc' },
  { id: 'dev', icon: '⌨️', gradient: 'from-cyan-500 to-blue-600', glow: 'rgba(6,182,212,0.15)', tKey: 'roleDev', descKey: 'roleDevDesc' },
  { id: 'user', icon: '💬', gradient: 'from-emerald-500 to-green-600', glow: 'rgba(34,197,94,0.15)', tKey: 'roleUser', descKey: 'roleUserDesc' },
];

export default function RoleSelect({ t, onSelect }) {
  const [stats, setStats] = useState({ total: 0, unique: 0 });

  useEffect(() => {
    const tid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anon';
    fetch('/api/stats/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramId: String(tid) }) })
      .then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 noise">
      <div className="mb-8 animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent to-cyan-500 flex items-center justify-center glow-accent mb-4">
          <span className="text-2xl">⚡</span>
        </div>
        <h1 className="text-2xl font-bold text-center"><span className="text-gradient">LLM Router</span></h1>
        <p className="text-sm text-white/30 text-center mt-1">{t.chooseRoleDesc}</p>
      </div>

      <div className="w-full max-w-sm space-y-3 animate-slide-up">
        {ROLES.map((role, i) => (
          <button
            key={role.id}
            onClick={() => onSelect(role.id)}
            className="w-full group relative overflow-hidden rounded-2xl bg-surface-2 border border-white/5 p-5 text-left transition-all duration-300 hover:border-white/10 card-hover"
            style={{ animationDelay: `${i * 80}ms`, boxShadow: `0 0 40px ${role.glow}` }}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center text-white text-xl flex-shrink-0`}>
                {role.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-white/90">{t[role.tKey]}</h3>
                <p className="text-xs text-white/35 mt-0.5">{t[role.descKey]}</p>
              </div>
              <svg className="w-5 h-5 text-white/15 group-hover:text-white/30 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
          </button>
        ))}
      </div>

      {/* Stats counter */}
      <div className="mt-8 flex items-center gap-6 text-white/20">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">👤</span>
          <span className="text-xs font-mono">{stats.unique}</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-1.5">
          <span className="text-lg">👁</span>
          <span className="text-xs font-mono">{stats.total}</span>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-white/15 font-mono">v2.0.0</p>
    </div>
  );
}
