// i18n.js — Multilingual support
const translations = {
  en: {
    welcome: 'Welcome to LLM Router',
    aiPanel: 'AI Dashboard',
    devPanel: 'Developer',
    userPanel: 'Chat',
    models: 'Available Models',
    testModel: 'Test Model',
    sendMessage: 'Send a message...',
    send: 'Send',
    clearChat: 'Clear Chat',
    selectModel: 'Select Model',
    apiKeys: 'API Keys',
    addKey: 'Add Key',
    removeKey: 'Remove',
    provider: 'Provider',
    status: 'Status',
    available: 'Available',
    unavailable: 'Unavailable',
    byokTitle: 'Your API Keys (BYOK)',
    byokDesc: 'Add your own API keys to unlock premium models',
    sdkTitle: 'API & SDK',
    sdkDesc: 'Integrate LLM Router into your project',
    webhookTitle: 'Webhooks',
    webhookDesc: 'Receive real-time notifications',
    docsTitle: 'Documentation',
    endpoint: 'Endpoint',
    noMessages: 'Start a conversation...',
    thinking: 'Thinking...',
    error: 'Error',
    retry: 'Retry',
    fallbackUsed: 'Fallback model used',
    settings: 'Settings',
    language: 'Language',
  },
  ru: {
    welcome: 'Добро пожаловать в LLM Router',
    aiPanel: 'ИИ Панель',
    devPanel: 'Разработчик',
    userPanel: 'Чат',
    models: 'Доступные модели',
    testModel: 'Тест модели',
    sendMessage: 'Напишите сообщение...',
    send: 'Отправить',
    clearChat: 'Очистить чат',
    selectModel: 'Выбрать модель',
    apiKeys: 'API Ключи',
    addKey: 'Добавить ключ',
    removeKey: 'Удалить',
    provider: 'Провайдер',
    status: 'Статус',
    available: 'Доступна',
    unavailable: 'Недоступна',
    byokTitle: 'Ваши API ключи (BYOK)',
    byokDesc: 'Добавьте свои ключи для доступа к премиум моделям',
    sdkTitle: 'API и SDK',
    sdkDesc: 'Интегрируйте LLM Router в ваш проект',
    webhookTitle: 'Вебхуки',
    webhookDesc: 'Получайте уведомления в реальном времени',
    docsTitle: 'Документация',
    endpoint: 'Эндпоинт',
    noMessages: 'Начните диалог...',
    thinking: 'Думаю...',
    error: 'Ошибка',
    retry: 'Повторить',
    fallbackUsed: 'Использована резервная модель',
    settings: 'Настройки',
    language: 'Язык',
  },
};

export function getTranslations(langCode) {
  if (langCode?.startsWith('ru')) return translations.ru;
  return translations.en;
}

export function detectLanguage() {
  try {
    const tg = window.Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.language_code || navigator.language || 'en';
  } catch {
    return 'en';
  }
}
