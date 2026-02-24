import React, { useState, useEffect } from 'react';
import { detectLanguage, getTranslations } from './i18n';
import AIDashboard from './panels/AIDashboard';
import DevDashboard from './panels/DevDashboard';
import UserDashboard from './panels/UserDashboard';

const TABS = ['userPanel', 'aiPanel', 'devPanel'];

const TAB_ICONS = {
  userPanel: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  aiPanel: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  devPanel: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
};

export default function App() {
  const [lang, setLang] = useState('en');
  const [t, setT] = useState(getTranslations('en'));
  const [activeTab, setActiveTab] = useState('userPanel');
  const [userId, setUserId] = useState('dev_user_1');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) {
        setUserId(String(tgUser.id));
        const detected = tgUser.language_code || 'en';
        setLang(detected);
        setT(getTranslations(detected));
      }
    }
  }, []);

  const switchLang = (code) => {
    setLang(code);
    setT(getTranslations(code));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f0f23]">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0f0f23]/80 border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">⚡</span>
            </div>
            <span className="text-white/90 font-semibold tracking-tight">LLM Router</span>
          </div>
          <button
            onClick={() => switchLang(lang.startsWith('ru') ? 'en' : 'ru')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all"
          >
            {lang.startsWith('ru') ? 'EN' : 'RU'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'userPanel' && <UserDashboard t={t} userId={userId} />}
        {activeTab === 'aiPanel' && <AIDashboard t={t} userId={userId} />}
        {activeTab === 'devPanel' && <DevDashboard t={t} userId={userId} />}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0f0f23]/90 border-t border-white/5">
        <div className="flex items-center justify-around py-2 px-4 max-w-md mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl transition-all duration-200 ${
                activeTab === tab
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {TAB_ICONS[tab]}
              <span className="text-[10px] font-medium">{t[tab]}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
