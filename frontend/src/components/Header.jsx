import React from 'react';
const ROLE_META = {
  user: { label: 'User', color: 'from-emerald-500 to-green-600', labelRu: 'Пользователь' },
  business: { label: 'Business', color: 'from-amber-500 to-orange-600', labelRu: 'Бизнес' },
  agent: { label: 'AI Agents', color: 'from-purple-500 to-indigo-600', labelRu: 'ИИ Агенты' },
  dev: { label: 'Developer', color: 'from-cyan-500 to-blue-600', labelRu: 'Разработчик' },
};
export default function Header({ role, lang, onLangToggle, onRoleChange, t }) {
  const meta = ROLE_META[role] || ROLE_META.user;
  const isRu = lang?.startsWith('ru');
  return (
    <header className="sticky top-0 z-50 glass border-b border-white/5">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center flex-shrink-0"><span className="text-sm">⚡</span></div>
          <div>
            <span className="text-sm font-semibold text-white/90 tracking-tight">LLM Router</span>
            <div className="flex items-center gap-1.5 mt-px"><div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${meta.color}`} /><span className="text-[10px] text-white/35 font-medium">{isRu ? meta.labelRu : meta.label}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onLangToggle} className="px-2 py-1 text-[10px] font-mono font-medium rounded-md bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 transition-all">{isRu ? 'EN' : 'RU'}</button>
          <button onClick={onRoleChange} className="p-1.5 rounded-md bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}
