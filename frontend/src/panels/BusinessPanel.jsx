import React, { useState } from 'react';

const TABS = ['overview', 'team', 'budget', 'usage'];

export default function BusinessPanel({ t, userId }) {
  const isRu = t?._lang === 'ru';
  const tr = (ru, en) => (isRu ? ru : en);
  const [tab, setTab] = useState('overview');
  const tabMeta = {
    overview: { icon: '📊', label: tr('Обзор', 'Overview') },
    team: { icon: '👥', label: tr('Команда', 'Team') },
    budget: { icon: '💰', label: tr('Бюджет', 'Budget') },
    usage: { icon: '📈', label: tr('Статистика', 'Usage') },
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
              <Card icon="👥" label={tr('Участники команды', 'Team members')} value="—" color="amber" />
              <Card icon="💰" label={tr('Месячный бюджет', 'Monthly budget')} value="—" color="emerald" />
              <Card icon="📊" label={tr('Запросы сегодня', 'Requests today')} value="—" color="cyan" />
              <Card icon="🔑" label={tr('API ключи', 'API keys')} value="—" color="purple" />
            </div>
            <div className="space-y-2">
              {[tr('🏢 Профиль организации', '🏢 Organization profile'), tr('📋 Лента активности', '📋 Activity feed'), tr('🔔 Алерты по использованию', '🔔 Usage alerts'), tr('📊 Аналитика затрат', '📊 Cost analytics')].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">{tr('Скоро', 'Soon')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'team' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">👥</div>
              <h3 className="text-lg font-semibold text-white/80">{tr('Управление командой', 'Team Management')}</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">{tr('Приглашайте участников, назначайте роли (Owner / Admin / Member), задавайте лимиты на пользователя.', 'Invite members, assign roles (Owner / Admin / Member), set per-user limits.')}</p>
            </div>
            <div className="space-y-2 mt-4">
              {[tr('👤 Роли Owner / Admin / Member', '👤 Owner / Admin / Member roles'), tr('📧 Приглашение через Telegram', '📧 Invite via Telegram'), tr('🔒 Ограничения моделей по пользователям', '🔒 Per-user model restrictions'), tr('📊 Использование по пользователям', '📊 Per-user usage tracking'), tr('🚫 Отозвать доступ', '🚫 Revoke access')].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">{tr('Скоро', 'Soon')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'budget' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">💰</div>
              <h3 className="text-lg font-semibold text-white/80">{tr('Контроль бюджета', 'Budget Control')}</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">{tr('Задавайте месячные лимиты, лимиты на пользователя и получайте алерты до перерасхода.', 'Set monthly caps, per-user limits, get alerts before overspending.')}</p>
            </div>
            <div className="space-y-2 mt-4">
              {[tr('📊 Месячный лимит бюджета', '📊 Monthly budget cap'), tr('👤 Дневной лимит на пользователя', '👤 Per-user daily limit'), tr('⚠️ Алерт на 80% использования', '⚠️ Alert at 80% usage'), tr('🔒 Автопауза при лимите', '🔒 Auto-pause at limit'), tr('💳 Telegram Stars / TON / карты', '💳 Telegram Stars / TON / Cards')].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
                  <span className="ml-auto text-[9px] text-white/15 bg-white/5 px-2 py-0.5 rounded-full">{tr('Скоро', 'Soon')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'usage' && (
          <div className="px-4 py-5 animate-fade-in">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">📈</div>
              <h3 className="text-lg font-semibold text-white/80">{tr('Панель использования', 'Usage Dashboard')}</h3>
              <p className="text-sm text-white/30 mt-2 max-w-xs mx-auto">{tr('Отслеживайте затраты по пользователям, моделям и времени. Экспортируйте отчеты.', 'Track costs by user, model, and time. Export reports.')}</p>
            </div>
            <div className="space-y-2 mt-4">
              {[tr('📈 График запросов по дням', '📈 Requests per day chart'), tr('💰 Разбивка затрат по моделям', '💰 Cost by model breakdown'), tr('👤 Топ пользователей по расходам', '👤 Top users by spend'), tr('🤖 Самые используемые модели', '🤖 Most used models'), tr('📋 Логи для экспорта (CSV)', '📋 Exportable logs (CSV)')].map((f,i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-dashed border-white/5">
                  <span className="text-xs text-white/25">{f}</span>
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

function Card({ icon, label, value, color }) {
  const c = { amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/10', emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/10', cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/10', purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/10' };
  return (<div className={`rounded-xl bg-gradient-to-br ${c[color]} border p-3`}><div className="flex items-center justify-between"><span className="text-lg">{icon}</span><span className="text-lg font-bold text-white/80">{value}</span></div><p className="text-[10px] text-white/30 mt-1">{label}</p></div>);
}
