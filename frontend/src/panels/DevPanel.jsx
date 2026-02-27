import React, { useState, useEffect } from 'react';
import { api } from '../api';

const TABS = ['keys', 'docs', 'playground', 'usage', 'billing', 'terminal'];
const PROVIDERS = ['openrouter', 'huggingface'];
const ADMIN_TOKEN_STORAGE_KEY = 'billing_admin_token';
const API_ENDPOINTS = [
  { m: 'POST', p: '/api/chat', d: '{ userId, model, message } → { response }' },
  { m: 'POST', p: '/api/chat/stream', d: 'SSE streaming response' },
  { m: 'GET', p: '/api/models', d: '?userId=... → { models[] }' },
  { m: 'GET', p: '/api/user/:id', d: '→ user profile' },
  { m: 'POST', p: '/api/user/:id/byok', d: '{ provider, apiKey }' },
  { m: 'DELETE', p: '/api/user/:id/byok/:prov', d: '→ remove key' },
  { m: 'GET', p: '/api/session/:id', d: '→ { messages[] }' },
  { m: 'DELETE', p: '/api/session/:id', d: '→ clear session' },
  { m: 'GET', p: '/api/health', d: '→ { status, uptime }' },
  { m: 'GET', p: '/api/stats', d: '→ { total, unique }' },
  { m: 'GET', p: '/api/billing/admin/analytics/funnel', d: 'requires X-Billing-Admin-Token' },
  { m: 'GET', p: '/api/billing/admin/payments/pending', d: '?minAgeMinutes=15&limit=100' },
  { m: 'POST', p: '/api/billing/admin/payments/:id/resolve', d: '{ action: failed|succeeded }' },
];

export default function DevPanel({ t, userId }) {
  const isRu = t?._lang === 'ru';
  const tr = (ru, en) => (isRu ? ru : en);

  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [provider, setProvider] = useState('openrouter');
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pgModel, setPgModel] = useState('');
  const [pgModels, setPgModels] = useState([]);
  const [pgInput, setPgInput] = useState('');
  const [pgResult, setPgResult] = useState(null);
  const [pgLoading, setPgLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [adminToken, setAdminToken] = useState('');
  const [adminTokenDraft, setAdminTokenDraft] = useState('');
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingInfo, setBillingInfo] = useState('');
  const [funnelHours, setFunnelHours] = useState(24);
  const [funnel, setFunnel] = useState(null);
  const [pendingMinAge, setPendingMinAge] = useState(15);
  const [pendingLimit, setPendingLimit] = useState(100);
  const [pending, setPending] = useState([]);
  const [timeoutMinAge, setTimeoutMinAge] = useState(120);
  const [timeoutLimit, setTimeoutLimit] = useState(200);
  const [resolveReason, setResolveReason] = useState('manual_review');

  useEffect(() => { loadKeys(); loadModels(); }, [userId]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
      setAdminToken(saved);
      setAdminTokenDraft(saved);
    } catch {
      // ignore storage issues
    }
  }, []);

  const loadKeys = async () => { try { const u = await api.getUser(userId); setKeys(u.byokKeys || []); } catch {} };
  const loadModels = async () => { try { const m = await api.models(userId); setPgModels(m); if (m.length) setPgModel(m[0].id); } catch {} };
  const saveKey = async () => { if (!newKey.trim()) return; setSaving(true); await api.saveByokKey(userId, provider, newKey.trim()); setNewKey(''); setSaved(true); setTimeout(() => setSaved(false), 2000); await loadKeys(); setSaving(false); };
  const deleteKey = async (prov) => { await api.deleteByokKey(userId, prov); await loadKeys(); };
  const runPlayground = async () => { if (!pgInput.trim()) return; setPgLoading(true); setPgResult(null); const start = Date.now(); try { const res = await api.chat(userId, pgModel, pgInput.trim()); setPgResult({ ok: true, response: res.response, model: res.model, provider: res.provider, fallback: res.fallback, ms: Date.now() - start }); } catch (e) { setPgResult({ ok: false, error: e.message, ms: Date.now() - start }); } setPgLoading(false); };
  const loadUsage = async () => { try { const [s, h] = await Promise.all([fetch('/api/stats').then(r=>r.json()), api.health()]); setStats(s); setHealth(h); } catch {} };
  useEffect(() => { if (tab === 'usage') loadUsage(); }, [tab]);
  const requireAdminToken = () => {
    const token = String(adminToken || '').trim();
    if (!token) throw new Error(tr('Сначала укажите токен Billing Admin', 'Set Billing admin token first'));
    return token;
  };
  const clearBillingStatus = () => {
    setBillingError('');
    setBillingInfo('');
  };
  const saveAdminToken = () => {
    const token = String(adminTokenDraft || '').trim();
    setAdminToken(token);
    try {
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } catch {
      // ignore storage issues
    }
    setBillingInfo(token ? tr('Токен сохранен локально', 'Admin token saved locally') : tr('Токен очищен', 'Admin token cleared'));
    setBillingError('');
  };
  const loadFunnel = async () => {
    setBillingBusy(true);
    clearBillingStatus();
    try {
      const token = requireAdminToken();
      const data = await api.billingAdmin.funnel(funnelHours, token);
      setFunnel(data);
      setBillingInfo(tr('Воронка загружена', 'Funnel loaded'));
    } catch (e) {
      setBillingError(String(e?.message || tr('Не удалось загрузить воронку', 'Failed to load funnel')));
    } finally {
      setBillingBusy(false);
    }
  };
  const loadPending = async () => {
    setBillingBusy(true);
    clearBillingStatus();
    try {
      const token = requireAdminToken();
      const data = await api.billingAdmin.pending(pendingMinAge, pendingLimit, token);
      setPending(Array.isArray(data?.payments) ? data.payments : []);
      setBillingInfo(`${tr('Ожидающие загружены', 'Pending loaded')}: ${data?.count || 0}`);
    } catch (e) {
      setBillingError(String(e?.message || tr('Не удалось загрузить ожидающие', 'Failed to load pending')));
    } finally {
      setBillingBusy(false);
    }
  };
  const runPendingTimeout = async () => {
    setBillingBusy(true);
    clearBillingStatus();
    try {
      const token = requireAdminToken();
      const result = await api.billingAdmin.timeoutRun({
        minAgeMinutes: timeoutMinAge,
        limit: timeoutLimit,
        reason: 'dev_panel_timeout_run',
      }, token);
      setBillingInfo(`${tr('Таймаут-обработка завершена, затронуто', 'Timeout run complete, affected')}=${result?.affected || 0}`);
      await loadPending();
    } catch (e) {
      setBillingError(String(e?.message || tr('Ошибка запуска таймаута', 'Timeout run failed')));
    } finally {
      setBillingBusy(false);
    }
  };
  const resolvePendingPayment = async (paymentId, action) => {
    setBillingBusy(true);
    clearBillingStatus();
    try {
      const token = requireAdminToken();
      await api.billingAdmin.resolvePayment(paymentId, action, resolveReason || 'dev_panel_resolve', token);
      setBillingInfo(`${tr('Платеж', 'Payment')} ${paymentId} ${tr('обновлен как', 'resolved as')} ${action}`);
      await loadPending();
      await loadFunnel();
    } catch (e) {
      setBillingError(String(e?.message || tr('Не удалось обновить статус', 'Resolve failed')));
    } finally {
      setBillingBusy(false);
    }
  };
  const runMaintenance = async (dryRun) => {
    setBillingBusy(true);
    clearBillingStatus();
    try {
      const token = requireAdminToken();
      const result = await api.billingAdmin.maintenanceRun(dryRun, token);
      setBillingInfo(
        `${tr('Операция обслуживания', 'Maintenance')} ${dryRun ? tr('dry-run', 'dry-run') : tr('run', 'run')} ${tr('завершена', 'complete')}: finalized=${result?.finalized || 0}, moved=${result?.movedToGrace || 0}`,
      );
    } catch (e) {
      setBillingError(String(e?.message || tr('Ошибка maintenance', 'Maintenance failed')));
    } finally {
      setBillingBusy(false);
    }
  };
  useEffect(() => {
    if (tab !== 'billing') return;
    if (!adminToken) return;
    loadFunnel().catch(() => {});
    loadPending().catch(() => {});
  }, [tab]);

  const tabMeta = {
    keys: { icon: '🔑', label: t.apiKeys || tr('Ключи', 'Keys') },
    docs: { icon: '📖', label: 'API' },
    playground: { icon: '🧪', label: tr('Тест', 'Test') },
    usage: { icon: '📊', label: tr('Статистика', 'Usage') },
    billing: { icon: '🛡️', label: tr('Биллинг', 'Billing') },
    terminal: { icon: '⬛', label: tr('Терминал', 'Terminal') },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(id => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab === id ? 'bg-cyan-500/15 text-cyan-400' : 'text-white/30 hover:text-white/50 hover:bg-white/5'}`}>
              <span className="text-[11px]">{tabMeta[id].icon}</span>{tabMeta[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'keys' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">{t.byokTitle}</h3><p className="text-xs text-white/30 mt-0.5">{t.byokDesc}</p></div>
            {keys.length > 0 && <div className="space-y-1.5">{keys.map(k => (
              <div key={k} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs font-mono text-white/60">{k}</span></div>
                <button onClick={() => deleteKey(k)} className="text-[10px] text-red-400/50 hover:text-red-400">{t.removeKey}</button>
              </div>
            ))}</div>}
            <div className="rounded-2xl bg-surface-2 border border-white/5 p-4 space-y-2.5">
              <select value={provider} onChange={e => setProvider(e.target.value)} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 focus:outline-none">{PROVIDERS.map(p => <option key={p} value={p} className="bg-surface-1">{p}</option>)}</select>
              <input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-... or hf_..." className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 font-mono placeholder-white/15 focus:outline-none" />
              <button onClick={saveKey} disabled={saving || !newKey.trim()} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-25 text-white text-sm font-medium transition-all">{saved ? '✓' : saving ? '...' : t.addKey}</button>
            </div>
          </div>
        )}
        {tab === 'docs' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">REST API</h3><p className="text-xs text-white/30 mt-0.5">Base: https://routertext.ru</p></div>
            <div className="space-y-1.5">{API_ENDPOINTS.map((ep, i) => (
              <div key={i} className="px-3 py-2.5 rounded-xl bg-surface-2 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${ep.m==='GET'?'bg-emerald-500/10 text-emerald-400':ep.m==='POST'?'bg-blue-500/10 text-blue-400':'bg-red-500/10 text-red-400'}`}>{ep.m}</span>
                  <span className="text-xs font-mono text-white/50">{ep.p}</span>
                </div>
                <p className="text-[10px] text-white/20 font-mono mt-1">{ep.d}</p>
              </div>
            ))}</div>
            <div className="rounded-2xl bg-surface-2 border border-dashed border-white/10 p-4 text-center"><p className="text-xs text-white/25">{tr('NPM SDK — скоро', 'NPM SDK — Coming soon')}</p></div>
          </div>
        )}
        {tab === 'playground' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div><h3 className="text-sm font-semibold text-white/80">{tr('⚡ Песочница API', '⚡ API Playground')}</h3></div>
            <select value={pgModel} onChange={e => setPgModel(e.target.value)} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 font-mono focus:outline-none">
              {pgModels.map(m => <option key={m.id} value={m.id} className="bg-surface-1">{m.name}</option>)}
            </select>
            <textarea value={pgInput} onChange={e => setPgInput(e.target.value)} placeholder={tr('Введите промпт...', 'Enter prompt...')} rows={3} className="w-full bg-surface-3 border border-white/5 rounded-xl px-3 py-2 text-sm text-white/60 placeholder-white/15 focus:outline-none resize-none" />
            <button onClick={runPlayground} disabled={pgLoading || !pgInput.trim()} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-25 text-white text-sm font-medium transition-all">{pgLoading ? tr('⏳ Выполняю...', '⏳ Running...') : tr('⚡ Отправить запрос', '⚡ Send Request')}</button>
            {pgResult && (
              <div className={`rounded-xl p-3 text-sm ${pgResult.ok ? 'bg-emerald-500/10 border border-emerald-500/15' : 'bg-red-500/10 border border-red-500/15'}`}>
                {pgResult.ok ? (<><p className="text-white/80 text-xs whitespace-pre-wrap">{pgResult.response}</p><div className="flex gap-3 mt-2 text-[10px] text-white/30"><span>📡 {pgResult.provider}</span><span>⏱ {pgResult.ms}ms</span>{pgResult.fallback && <span className="text-amber-400">{tr('⚡ резервная модель', '⚡ fallback')}</span>}</div></>) : <p className="text-red-300 text-xs">❌ {pgResult.error} ({pgResult.ms}ms)</p>}
              </div>
            )}
          </div>
        )}
        {tab === 'usage' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-white/80">{tr('📊 Статистика', '📊 Usage')}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <UCard icon="👤" label={tr('Уникальные пользователи', 'Unique users')} value={stats?.unique || 0} color="cyan" />
              <UCard icon="👁" label={tr('Всего визитов', 'Total visits')} value={stats?.total || 0} color="purple" />
              <UCard icon="💬" label={tr('Сессии', 'Sessions')} value={health?.activeSessions || 0} color="emerald" />
              <UCard icon="⏱" label={tr('Аптайм', 'Uptime')} value={health ? Math.floor(health.uptime/3600)+'h' : '-'} color="amber" />
            </div>
            <div className="space-y-2">
              {[tr('💰 Стоимость токенов по моделям', '💰 Token costs per model'), tr('📈 График запросов/день', '📈 Requests/day chart'), tr('🏆 Топ моделей', '🏆 Top models'), tr('⚠️ Отслеживание ошибок', '⚠️ Error tracking')].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">{tr('Скоро', 'Soon')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'billing' && (
          <div className="px-4 py-5 space-y-4 animate-fade-in">
            <div>
              <h3 className="text-sm font-semibold text-white/80">{tr('🛡️ Админка биллинга', '🛡️ Billing Admin')}</h3>
              <p className="text-xs text-white/30 mt-1">{tr('Ожидающие платежи, аналитика воронки и служебные операции.', 'Pending payments, funnel analytics, and maintenance controls.')}</p>
            </div>

            <div className="rounded-xl bg-surface-2 border border-white/5 p-3 space-y-2">
              <label className="text-[11px] text-white/35">{tr('Токен админки биллинга', 'Billing admin token')}</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminTokenDraft}
                  onChange={(e) => setAdminTokenDraft(e.target.value)}
                  placeholder={tr('Вставьте BILLING_ADMIN_TOKEN', 'Paste BILLING_ADMIN_TOKEN')}
                  className="flex-1 bg-surface-3 border border-white/5 rounded-lg px-3 py-2 text-xs text-white/70 font-mono placeholder-white/15 focus:outline-none"
                />
                <button
                  onClick={saveAdminToken}
                  className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-[11px] font-medium text-white"
                >
                  {t.save || tr('Сохранить', 'Save')}
                </button>
              </div>
              <p className="text-[10px] text-white/25">{tr('Хранится в localStorage на этом устройстве.', 'Stored in localStorage on this device.')}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={loadFunnel} disabled={billingBusy} className="py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-[11px] font-medium text-white disabled:opacity-40">{tr('Обновить воронку', 'Refresh Funnel')}</button>
              <button onClick={loadPending} disabled={billingBusy} className="py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-[11px] font-medium text-white disabled:opacity-40">{tr('Обновить pending', 'Refresh Pending')}</button>
              <button onClick={() => runMaintenance(true)} disabled={billingBusy} className="py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-[11px] font-medium text-white disabled:opacity-40">{tr('Проверка обслуживания (dry-run)', 'Maintenance Dry-Run')}</button>
              <button onClick={() => runMaintenance(false)} disabled={billingBusy} className="py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-[11px] font-medium text-white disabled:opacity-40">{tr('Запуск обслуживания', 'Maintenance Run')}</button>
            </div>

            {billingError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{billingError}</p>}
            {billingInfo && !billingError && <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{billingInfo}</p>}

            <div className="rounded-xl bg-surface-2 border border-white/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">{tr('Окно воронки (часы)', 'Funnel Window (hours)')}</span>
                <input value={funnelHours} onChange={(e) => setFunnelHours(e.target.value)} className="ml-auto w-20 bg-surface-3 border border-white/5 rounded px-2 py-1 text-xs text-white/70 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(funnel?.counts || []).map((item) => (
                  <div key={item.event} className="rounded-lg bg-surface-3 border border-white/5 p-2">
                    <p className="text-[10px] text-white/30">{item.event}</p>
                    <p className="text-sm text-white/80 font-semibold">{item.total}</p>
                    <p className="text-[10px] text-white/30">{tr('пользователи', 'users')}: {item.users}</p>
                  </div>
                ))}
              </div>
              {funnel?.conversion && (
                <div className="rounded-lg bg-surface-3 border border-white/5 p-2 text-[11px] text-white/65 space-y-1">
                  <p>paywall→checkout: {funnel.conversion.paywallToCheckoutPct}%</p>
                  <p>checkout→pre_checkout: {funnel.conversion.checkoutToPreCheckoutPct}%</p>
                  <p>pre_checkout→paid: {funnel.conversion.preCheckoutToPaidPct}%</p>
                  <p>checkout→paid: {funnel.conversion.checkoutToPaidPct}%</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-surface-2 border border-white/5 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/35">{tr('Мин. возраст pending (мин)', 'Pending min age (min)')}</label>
                  <input value={pendingMinAge} onChange={(e) => setPendingMinAge(e.target.value)} className="mt-1 w-full bg-surface-3 border border-white/5 rounded px-2 py-1.5 text-xs text-white/70 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-white/35">{tr('Лимит pending', 'Pending limit')}</label>
                  <input value={pendingLimit} onChange={(e) => setPendingLimit(e.target.value)} className="mt-1 w-full bg-surface-3 border border-white/5 rounded px-2 py-1.5 text-xs text-white/70 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-white/35">{tr('Возраст таймаута (мин)', 'Timeout age (min)')}</label>
                  <input value={timeoutMinAge} onChange={(e) => setTimeoutMinAge(e.target.value)} className="mt-1 w-full bg-surface-3 border border-white/5 rounded px-2 py-1.5 text-xs text-white/70 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-white/35">{tr('Лимит батча таймаута', 'Timeout batch limit')}</label>
                  <input value={timeoutLimit} onChange={(e) => setTimeoutLimit(e.target.value)} className="mt-1 w-full bg-surface-3 border border-white/5 rounded px-2 py-1.5 text-xs text-white/70 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-white/35">{tr('Причина резолва', 'Resolve reason')}</label>
                <input value={resolveReason} onChange={(e) => setResolveReason(e.target.value)} className="mt-1 w-full bg-surface-3 border border-white/5 rounded px-2 py-1.5 text-xs text-white/70 focus:outline-none" />
              </div>
              <button onClick={runPendingTimeout} disabled={billingBusy} className="w-full py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-[11px] font-medium text-white disabled:opacity-40">{tr('Запустить timeout pending', 'Run Pending Timeout')}</button>
            </div>

            <div className="space-y-2">
              {pending.length === 0 && (
                <div className="rounded-lg bg-surface-2 border border-white/5 p-3 text-xs text-white/35">{tr('Нет pending-платежей для текущего фильтра.', 'No pending payments for current filter.')}</div>
              )}
              {pending.map((p) => (
                <div key={p.id} className="rounded-lg bg-surface-2 border border-white/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-white/70">
                    <span className="font-mono text-cyan-300">#{p.id}</span>
                    <span className="text-white/35">tg:{p.telegram_id}</span>
                    <span className="ml-auto text-amber-300">{p.age_minutes}m</span>
                  </div>
                  <div className="text-[11px] text-white/45 break-all font-mono">{p.external_payment_id}</div>
                  <div className="flex gap-2">
                    <button onClick={() => resolvePendingPayment(p.id, 'failed')} disabled={billingBusy} className="flex-1 py-1.5 rounded bg-red-600/80 hover:bg-red-500 text-[11px] text-white disabled:opacity-40">{tr('Пометить failed', 'Mark Failed')}</button>
                    <button onClick={() => resolvePendingPayment(p.id, 'succeeded')} disabled={billingBusy} className="flex-1 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-[11px] text-white disabled:opacity-40">{tr('Пометить succeeded', 'Mark Succeeded')}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'terminal' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-4 mb-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-3">⬛</div>
              <h3 className="text-lg font-semibold text-white/80">{tr('Веб-терминал', 'Web Terminal')}</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">{tr('Выполняйте команды, деплой и управление LLM Router прямо из приложения.', 'Execute commands, deploy, and manage your LLM Router directly from the app.')}</p>
            </div>
            {/* Fake terminal preview */}
            <div className="rounded-xl bg-black/40 border border-white/5 p-4 font-mono text-xs space-y-1">
              <p className="text-emerald-400">$ llm status</p>
              <p className="text-white/50">{tr('✓ Backend: работает (аптайм 13ч)', '✓ Backend: running (uptime 13h)')}</p>
              <p className="text-white/50">{tr('✓ Модели: 15 доступны', '✓ Models: 15 available')}</p>
              <p className="text-white/50">{tr('✓ Пользователи: 3 уникальных', '✓ Users: 3 unique')}</p>
              <p className="text-emerald-400 mt-2">$ llm deploy</p>
              <p className="text-white/50">{tr('Сборка frontend... ✓', 'Building frontend... ✓')}</p>
              <p className="text-white/50">{tr('Перезапуск сервиса... ✓', 'Restarting service... ✓')}</p>
              <p className="text-white/50">{tr('Деплой завершен.', 'Deploy complete.')}</p>
              <p className="text-emerald-400 mt-2">$ _<span className="animate-pulse">▍</span></p>
            </div>
            {/* Planned commands */}
            <div className="space-y-2 mt-4">
              {[
                tr('$ llm status — здоровье сервера и метрики', '$ llm status — server health & stats'),
                tr('$ llm deploy — сборка и перезапуск', '$ llm deploy — build & restart'),
                tr('$ llm logs — логи сервера в реальном времени', '$ llm logs — live server logs'),
                tr('$ llm git push — коммит и push в GitHub', '$ llm git push — commit & push to GitHub'),
                tr('$ llm models — список доступных моделей', '$ llm models — list available models'),
                tr('$ llm test <model> — быстрый тест модели', '$ llm test <model> — quick model test'),
                tr('$ llm backup — создать бэкап сервера', '$ llm backup — create server backup'),
              ].map((cmd, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-[11px] font-mono text-cyan-400/40">{cmd}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">{tr('Скоро', 'Soon')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UCard({ icon, label, value, color }) {
  const c = { cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/10', purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/10', emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/10', amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/10' };
  return (<div className={`rounded-xl bg-gradient-to-br ${c[color]} border p-3`}><span className="text-lg">{icon}</span><span className="text-lg font-bold text-white/80 ml-2">{value}</span><p className="text-[10px] text-white/30 mt-1">{label}</p></div>);
}
