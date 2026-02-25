import React, { useState, useEffect } from 'react';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { detectLang, getT } from './i18n';
import { e2e } from './crypto';
import PinLock from './components/PinLock';
import RoleSelect from './components/RoleSelect';
import Header from './components/Header';
import UserPanel from './panels/UserPanel';
import AgentPanel from './panels/AgentPanel';
import DevPanel from './panels/DevPanel';

export default function App() {
  const [lang, setLang] = useState('en');
  const [t, setT] = useState(getT('en'));
  const [role, setRole] = useState(null);
  const [userId, setUserId] = useState('dev_test_1');
  const [e2eKey, setE2eKey] = useState(null);
  const [locked, setLocked] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready(); tg.expand();
      document.documentElement.style.setProperty('--tg-bg', tg.themeParams?.bg_color || '#0a0a1a');
      const user = tg.initDataUnsafe?.user;
      if (user) {
        setUserId(String(user.id));
        const detected = user.language_code || 'en';
        setLang(detected); setT(getT(detected));
      }
    } else {
      const detected = detectLang();
      setLang(detected); setT(getT(detected));
    }
    // Check if already unlocked this session
    e2e.loadKey().then(key => {
      if (key) { setE2eKey(key); setLocked(false); }
    });
    try { const saved = localStorage.getItem('llm_role'); if (saved) setRole(saved); } catch {}
  }, []);

  const switchLang = () => { const next = lang.startsWith('ru') ? 'en' : 'ru'; setLang(next); setT(getT(next)); };
  const selectRole = (r) => { setRole(r); try { localStorage.setItem('llm_role', r); } catch {} };
  const changeRole = () => { setRole(null); try { localStorage.removeItem('llm_role'); } catch {} };
  const handleUnlock = (key) => { setE2eKey(key); setLocked(false); };

  return (
    <TonConnectUIProvider manifestUrl="https://routertext.ru/tonconnect-manifest.json">
      {locked ? (
        <PinLock userId={userId} onUnlock={handleUnlock} t={t} />
      ) : !role ? (
        <RoleSelect t={t} onSelect={selectRole} />
      ) : (
        <div className="min-h-screen min-h-[100dvh] flex flex-col bg-surface-0 noise">
          <Header role={role} lang={lang} onLangToggle={switchLang} onRoleChange={changeRole} t={t} userId={userId} />
          {role === 'user' && <UserPanel t={t} userId={userId} e2eKey={e2eKey} />}
          {role === 'agent' && <AgentPanel t={t} userId={userId} e2eKey={e2eKey} />}
          {role === 'dev' && <DevPanel t={t} userId={userId} e2eKey={e2eKey} />}
        </div>
      )}
    </TonConnectUIProvider>
  );
}
