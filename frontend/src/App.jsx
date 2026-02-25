import React, { useState, useEffect } from 'react';
import { detectLang, getT } from './i18n';
import RoleSelect from './components/RoleSelect';
import Header from './components/Header';
import UserPanel from './panels/UserPanel';
import AgentPanel from './panels/AgentPanel';
import DevPanel from './panels/DevPanel';

export default function App() {
  const [lang, setLang] = useState('en');
  const [t, setT] = useState(getT('en'));
  const [role, setRole] = useState(null); // null = show role picker
  const [userId, setUserId] = useState('dev_test_1');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      // Set theme
      document.documentElement.style.setProperty('--tg-bg', tg.themeParams?.bg_color || '#0a0a1a');
      const user = tg.initDataUnsafe?.user;
      if (user) {
        setUserId(String(user.id));
        const detected = user.language_code || 'en';
        setLang(detected);
        setT(getT(detected));
      }
    } else {
      const detected = detectLang();
      setLang(detected);
      setT(getT(detected));
    }

    // Restore saved role
    try {
      const saved = localStorage.getItem('llm_role');
      if (saved) setRole(saved);
    } catch {}
  }, []);

  const switchLang = () => {
    const next = lang.startsWith('ru') ? 'en' : 'ru';
    setLang(next);
    setT(getT(next));
  };

  const selectRole = (r) => {
    setRole(r);
    try { localStorage.setItem('llm_role', r); } catch {}
  };

  const changeRole = () => {
    setRole(null);
    try { localStorage.removeItem('llm_role'); } catch {}
  };

  // Role selection screen
  if (!role) {
    return <RoleSelect t={t} onSelect={selectRole} />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-surface-0 noise">
      <Header role={role} lang={lang} onLangToggle={switchLang} onRoleChange={changeRole} t={t} />
      {role === 'user' && <UserPanel t={t} userId={userId} />}
      {role === 'agent' && <AgentPanel t={t} userId={userId} />}
      {role === 'dev' && <DevPanel t={t} userId={userId} />}
    </div>
  );
}
