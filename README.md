# 🚀 TG-LLM Router — Telegram Mini App MVP

Telegram Mini App с LLM роутером: чат с AI через OpenRouter и HuggingFace с автоматическим fallback.

## Архитектура

```
Frontend (React + Tailwind + Telegram WebApp SDK)
    ↓ REST API
Backend (Node.js + Express)
    ↓
LLM Router (fallback logic)
    ↓
Providers: OpenRouter | HuggingFace
```

## 3 Панели (ЛК)

| Панель | Описание |
|--------|----------|
| 💬 Chat | Чат с LLM, выбор модели, история |
| 🤖 AI Dashboard | Список моделей, статусы, тест |
| 👨‍💻 Developer | BYOK ключи, API документация, вебхуки |

## Быстрый старт

### 1. Backend

```bash
cd backend
cp .env.example .env
# Заполните API ключи в .env
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000 → проксирует API на :3001

### Docker

```bash
cp backend/.env.example backend/.env
# Заполните ключи
docker-compose up --build
```

Приложение: http://localhost:3001

## API Endpoints

| Method | Path | Описание |
|--------|------|----------|
| GET | /api/health | Статус сервера |
| GET | /api/models | Список моделей |
| POST | /api/chat | Отправить сообщение |
| GET | /api/user/:id | Профиль пользователя |
| POST | /api/user/:id/byok | Сохранить BYOK ключ |
| GET | /api/session/:id | История чата |
| DELETE | /api/session/:id | Очистить чат |

## Фичи MVP

- ✅ 3 панели ЛК
- ✅ Авто-определение языка из Telegram (RU/EN)
- ✅ OpenRouter + HuggingFace с fallback
- ✅ BYOK (зашифрованные ключи)
- ✅ Rate limiting
- ✅ Логирование запросов
- ✅ История сессии (in-memory)
- ✅ Мобильная адаптация (Tailwind)
- ✅ Docker-ready

## Стек

- **Frontend**: React 18 + Vite + Tailwind CSS + Telegram WebApp SDK
- **Backend**: Node.js + Express + crypto-js
- **LLM**: OpenRouter (free models) + HuggingFace Inference
- **Infra**: Docker + docker-compose

## Для Telegram Bot

1. Создайте бота через @BotFather
2. Включите Mini App: /newapp → укажите URL вашего deployed frontend
3. Готово — пользователи открывают Mini App из бота

## Лицензия

MIT
