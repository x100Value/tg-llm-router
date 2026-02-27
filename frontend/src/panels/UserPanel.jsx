import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';

function formatPeriodEnd(value, isRu) {
  if (!value) return isRu ? 'Без срока' : 'No expiry';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

export default function UserPanel({ t, userId }) {
  const isRu = t?._lang === 'ru';
  const tr = (ru, en) => (isRu ? ru : en);

  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [personas, setPersonas] = useState([]);
  const [persona, setPersona] = useState(null);
  const [showPersonas, setShowPersonas] = useState(false);
  const [modes, setModes] = useState([]);
  const [mode, setMode] = useState(null);
  const [showModes, setShowModes] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutPlanCode, setCheckoutPlanCode] = useState('');
  const endRef = useRef(null);
  const paywallTrackedRef = useRef(false);

  useEffect(() => {
    api.models(userId).then(m => { setModels(m); if (m.length && !model) setModel(m[0].id); });
    fetch('/api/personas?lang=' + (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en'))
      .then(r => r.json()).then(d => setPersonas(d.personas || [])).catch(() => {});
    fetch('/api/modes?lang=' + (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en'))
      .then(r => r.json()).then(d => setModes(d.modes || [])).catch(() => {});
  }, [userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  useEffect(() => {
    let cancelled = false;

    const loadBilling = async () => {
      if (!userId) return;
      setBillingLoading(true);
      try {
        const [billingPlans, billingMe] = await Promise.all([
          api.billing.plans(),
          api.billing.me(userId),
        ]);
        if (cancelled) return;
        setPlans(Array.isArray(billingPlans) ? billingPlans : []);
        setSubscription(billingMe?.subscription || null);
        setBillingError('');
      } catch (err) {
        if (cancelled) return;
        setBillingError(String(err?.message || tr('Биллинг недоступен', 'Billing unavailable')));
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    };

    loadBilling();
    return () => { cancelled = true; };
  }, [userId]);

  const refreshBilling = async () => {
    if (!userId) return;
    const billingMe = await api.billing.me(userId);
    setSubscription(billingMe?.subscription || null);
  };

  const activeSubscription = useMemo(() => {
    if (!subscription) return null;
    if (!subscription.current_period_end) return subscription;
    const end = new Date(subscription.current_period_end);
    if (Number.isNaN(end.getTime())) return null;
    return end > new Date() ? subscription : null;
  }, [subscription]);

  useEffect(() => {
    if (!showPaywall) {
      paywallTrackedRef.current = false;
      return;
    }
    if (!userId || paywallTrackedRef.current) return;

    paywallTrackedRef.current = true;
    void api.billing.paywallOpen(userId, {
      source: 'user_panel_paywall',
      metadata: {
        activeSubscription: Boolean(activeSubscription),
      },
    }).catch(() => {});
  }, [showPaywall, userId, activeSubscription]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMsgs(p => [...p, { role: 'user', content: text }]);
    setLoading(true);
    setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true }]);
    try {
      let finalMsg = text;
      if (persona) finalMsg = `[System: ${persona.prompt}]\n\nUser: ${text}`;
      if (mode) finalMsg = `[Mode: ${mode.desc}. Max ${mode.maxTokens} tokens.]\n\n${finalMsg}`;
      await api.chatStream(userId, model, finalMsg, (chunk) => {
        setMsgs(p => { const u=[...p]; const l=u[u.length-1]; if(l&&l.role==='assistant') l.content+=chunk; return u; });
      });
      setMsgs(p => { const u=[...p]; const l=u[u.length-1]; if(l) l.streaming=false; return u; });
    } catch (err) {
      const isLimit = err.message?.includes('Daily limit');
      if (isLimit) setShowPaywall(true);
      setMsgs(p => { const u=[...p]; const l=u[u.length-1];
        if(l&&l.role==='assistant'&&!l.content) { l.content=isLimit?tr('🔒 Дневной лимит достигнут (20 бесплатно). Обновите план для безлимита.','🔒 Daily limit reached (20 free). Upgrade for unlimited.'):'⚠️ '+err.message; l.error=true; }
        else u.push({role:'assistant',content:'⚠️ '+err.message,error:true});
        return u;
      });
    }
    setLoading(false);
  };

  const checkout = async (planCode) => {
    if (!planCode || checkoutPlanCode) return;
    setCheckoutPlanCode(planCode);
    setBillingError('');
    try {
      const result = await api.billing.checkout(userId, planCode, 'telegram_stars', {
        source: 'user_panel_paywall',
      });
      const invoiceLink = result?.providerPayload?.invoiceLink;

      if (invoiceLink && window.Telegram?.WebApp?.openInvoice) {
        await new Promise((resolve) => {
          window.Telegram.WebApp.openInvoice(invoiceLink, () => resolve());
        });
      } else if (invoiceLink) {
        window.open(invoiceLink, '_blank', 'noopener,noreferrer');
      }

      await refreshBilling();
    } catch (err) {
      setBillingError(String(err?.message || tr('Не удалось создать оплату', 'Checkout failed')));
    } finally {
      setCheckoutPlanCode('');
    }
  };

  const clear = async () => { await api.clearSession(userId); setMsgs([]); };
  const cur = models.find(m => m.id === model);

  return (
    <div className="relative flex flex-col h-[calc(100vh-48px)]">
      {/* Top bar */}
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Model selector */}
          <button onClick={() => { setShowModels(!showModels); setShowPersonas(false); setShowModes(false); }} className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface-2 border border-white/5 hover:border-white/10 transition-all text-left min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-[12px] text-white/70 truncate font-mono">{cur?.name || t.selectModel}</span>
            <svg className={`w-3 h-3 text-white/20 ml-auto transition-transform flex-shrink-0 ${showModels?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {/* Mode button */}
          <button onClick={() => { setShowModes(!showModes); setShowModels(false); setShowPersonas(false); }} className={`p-2 rounded-xl border transition-all flex-shrink-0 ${mode?'bg-amber-500/15 border-amber-500/20':'bg-surface-2 border-white/5 hover:border-white/10'}`} title={tr('Режим', 'Mode')}>
            <span className="text-sm">{mode?.icon || '⚡'}</span>
          </button>
          {/* Persona button */}
          <button onClick={() => { setShowPersonas(!showPersonas); setShowModels(false); setShowModes(false); }} className={`p-2 rounded-xl border transition-all flex-shrink-0 ${persona?'bg-purple-500/15 border-purple-500/20 text-purple-400':'bg-surface-2 border-white/5 hover:border-white/10 text-white/25'}`} title={tr('Персона', 'Persona')}>
            <span className="text-sm">{persona?.icon || '🎭'}</span>
          </button>
          {/* Private toggle */}
          <button onClick={() => setIsPrivate(!isPrivate)} className={`p-2 rounded-xl border transition-all flex-shrink-0 ${isPrivate?'bg-red-500/15 border-red-500/20':'bg-surface-2 border-white/5 hover:border-white/10'}`} title={isPrivate?tr('Приватный: включен','Private ON'):tr('Приватный: выключен','Private OFF')}>
            <span className="text-sm">{isPrivate ? '🔒' : '🔓'}</span>
          </button>
          {/* Clear */}
          <button onClick={clear} className="p-2 rounded-xl bg-surface-2 border border-white/5 text-white/25 hover:text-red-400 hover:border-red-500/20 transition-all flex-shrink-0" title={t.clearChat}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>

        {/* Dropdowns */}
        {showModels && (
          <div className="mt-2 rounded-xl bg-surface-3 border border-white/5 max-h-48 overflow-y-auto">
            {models.map(m => (
              <button key={m.id} onClick={() => { setModel(m.id); setShowModels(false); }} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 ${m.id===model?'bg-indigo-500/10':''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${m.status==='available'?'bg-emerald-400':'bg-red-400'}`} />
                <span className={`text-xs font-mono truncate ${m.id===model?'text-indigo-400':'text-white/50'}`}>{m.name}</span>
                <span className="ml-auto text-[9px] text-white/15">{m.provider}</span>
              </button>
            ))}
          </div>
        )}
        {showModes && (
          <div className="mt-2 rounded-xl bg-surface-3 border border-white/5 overflow-hidden">
            <button onClick={() => { setMode(null); setShowModes(false); }} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 ${!mode?'bg-white/5':''}`}>
              <span className="text-sm">🔄</span><span className="text-xs text-white/50">{tr('По умолчанию (без режима)', 'Default (no mode)')}</span>
            </button>
            {modes.map(m => (
              <button key={m.id} onClick={() => { setMode(m); setShowModes(false); }} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 ${mode?.id===m.id?'bg-amber-500/10':''}`}>
                <span className="text-sm">{m.icon}</span>
                <span className={`text-xs ${mode?.id===m.id?'text-amber-400':'text-white/50'}`}>{m.displayLabel}</span>
                <span className="ml-auto text-[9px] text-white/20">{m.desc}</span>
              </button>
            ))}
          </div>
        )}
        {showPersonas && (
          <div className="mt-2 rounded-xl bg-surface-3 border border-white/5 overflow-hidden">
            <button onClick={() => { setPersona(null); setShowPersonas(false); }} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 ${!persona?'bg-white/5':''}`}>
              <span className="text-sm">💬</span><span className="text-xs text-white/50">{tr('Без персоны', 'No persona')}</span>
            </button>
            {personas.map(p => (
              <button key={p.id} onClick={() => { setPersona(p); setShowPersonas(false); }} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 ${persona?.id===p.id?'bg-purple-500/10':''}`}>
                <span className="text-sm">{p.icon}</span>
                <span className={`text-xs ${persona?.id===p.id?'text-purple-400':'text-white/50'}`}>{p.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {(persona || mode || isPrivate) && (
        <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2 flex-wrap">
          {mode && <span className="text-[10px] bg-amber-500/10 text-amber-400/70 px-2 py-0.5 rounded-full">{mode.icon} {mode.displayLabel}</span>}
          {persona && <span className="text-[10px] bg-purple-500/10 text-purple-400/70 px-2 py-0.5 rounded-full">{persona.icon} {persona.displayName}</span>}
          {isPrivate && <span className="text-[10px] bg-red-500/10 text-red-400/70 px-2 py-0.5 rounded-full">{tr('🔒 Приватный', '🔒 Private')}</span>}
        </div>
      )}

      {!billingLoading && (
        <div className="px-3 py-2 border-b border-white/5">
          {activeSubscription ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
              <span className="text-xs">✅</span>
              <div className="min-w-0">
                <p className="text-[11px] text-emerald-300 truncate">
                  {tr('План', 'Plan')}: {activeSubscription.plan_code || tr('активен', 'active')} {tr('до', 'until')} {formatPeriodEnd(activeSubscription.current_period_end, isRu)}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 flex items-center gap-2">
              <span className="text-xs">🔒</span>
              <p className="text-[11px] text-amber-300 flex-1 min-w-0 truncate">
                {tr('Бесплатный доступ с лимитами. Обновите план для больших лимитов.', 'Free access has limits. Upgrade to unlock higher caps.')}
              </p>
              <button
                onClick={() => setShowPaywall(true)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-amber-500 text-black"
              >
                {tr('Обновить план', 'Upgrade')}
              </button>
            </div>
          )}
          {billingError && (
            <p className="text-[10px] text-red-300/90 mt-1">{billingError}</p>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-3 flex items-center justify-center"><span className="text-2xl opacity-60">💬</span></div>
            <p className="text-sm text-white/20">{t.noMessages}</p>
            {isPrivate && <p className="text-[10px] text-red-400/40">{tr('🔒 Приватный режим — история не сохраняется', '🔒 Private mode — history not saved')}</p>}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg-enter flex ${m.role==='user'?'justify-end':'justify-start'}`}>
            <div className={`max-w-[82%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              m.role==='user'?'bg-indigo-600 text-white rounded-2xl rounded-br-md'
              :m.error?'bg-red-500/10 text-red-300 border border-red-500/15 rounded-2xl rounded-bl-md'
              :'bg-surface-2 text-white/80 border border-white/5 rounded-2xl rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap break-words">{m.content}{m.streaming?'▍':''}</p>
            </div>
          </div>
        ))}
        {loading && msgs[msgs.length-1]?.content==='' && (
          <div className="flex justify-start msg-enter">
            <div className="bg-surface-2 border border-white/5 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5"><span className="typing-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" /><span className="typing-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" /><span className="typing-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" /></div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2.5 border-t border-white/5 glass">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} }} placeholder={t.sendMessage} rows={1} className="flex-1 resize-none bg-surface-2 border border-white/5 rounded-xl px-3.5 py-2.5 text-[13px] text-white/85 placeholder-white/20 focus:outline-none focus:border-indigo-500/40 transition-all" style={{maxHeight:'100px'}} />
          <button onClick={send} disabled={loading||!input.trim()} className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 text-white transition-all flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </div>
      </div>

      {showPaywall && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm p-3 flex items-end">
          <div className="w-full rounded-2xl border border-white/10 bg-surface-1 p-3 max-h-[78vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">💳</span>
              <h3 className="text-sm font-semibold text-white/85">{tr('Обновление плана', 'Upgrade plan')}</h3>
              <button onClick={() => setShowPaywall(false)} className="ml-auto text-xs text-white/50 hover:text-white/80">{tr('Закрыть', 'Close')}</button>
            </div>
            <div className="space-y-2">
              {plans.map((plan) => (
                <div key={plan.code} className="rounded-xl border border-white/10 bg-surface-2 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white/85">{plan.name}</p>
                    <span className="ml-auto text-xs text-amber-300">{plan.price_xtr} {plan.currency || 'XTR'}</span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-1">{plan.description || tr('Подписка', 'Subscription plan')}</p>
                  <button
                    onClick={() => checkout(plan.code)}
                    disabled={!!checkoutPlanCode}
                    className="mt-2 w-full rounded-lg bg-amber-500 text-black text-xs font-semibold py-2 disabled:opacity-50"
                  >
                    {checkoutPlanCode === plan.code ? tr('Обработка...', 'Processing...') : `${tr('Оплатить', 'Pay')} ${plan.price_xtr} ${plan.currency || 'XTR'}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
