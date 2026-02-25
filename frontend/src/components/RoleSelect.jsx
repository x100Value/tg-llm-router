import React from 'react';

const ROLES = [
  {
    id: 'agent',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
    gradient: 'from-purple-500 to-indigo-600',
    glow: 'rgba(139, 92, 246, 0.15)',
    tKey: 'roleAgent',
    descKey: 'roleAgentDesc',
  },
  {
    id: 'dev',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    gradient: 'from-cyan-500 to-blue-600',
    glow: 'rgba(6, 182, 212, 0.15)',
    tKey: 'roleDev',
    descKey: 'roleDevDesc',
  },
  {
    id: 'user',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    gradient: 'from-emerald-500 to-green-600',
    glow: 'rgba(34, 197, 94, 0.15)',
    tKey: 'roleUser',
    descKey: 'roleUserDesc',
  },
];

export default function RoleSelect({ t, onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 noise">
      {/* Logo */}
      <div className="mb-8 animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent to-cyan-500 flex items-center justify-center glow-accent mb-4">
          <span className="text-2xl">⚡</span>
        </div>
        <h1 className="text-2xl font-bold text-center">
          <span className="text-gradient">LLM Router</span>
        </h1>
        <p className="text-sm text-white/30 text-center mt-1">{t.chooseRoleDesc}</p>
      </div>

      {/* Role cards */}
      <div className="w-full max-w-sm space-y-3 animate-slide-up">
        {ROLES.map((role, i) => (
          <button
            key={role.id}
            onClick={() => onSelect(role.id)}
            className="w-full group relative overflow-hidden rounded-2xl bg-surface-2 border border-white/5 p-5 text-left transition-all duration-300 hover:border-white/10 card-hover"
            style={{ animationDelay: `${i * 80}ms`, boxShadow: `0 0 40px ${role.glow}` }}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center text-white flex-shrink-0`}>
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
            {/* Gradient line at bottom */}
            <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
          </button>
        ))}
      </div>

      {/* Version */}
      <p className="mt-8 text-[10px] text-white/15 font-mono">v1.0.0-mvp</p>
    </div>
  );
}
