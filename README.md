# ⚡ TG-LLM Router — Telegram Mini App

Unified LLM router: chat with AI through OpenRouter (15+ free models) with automatic fallback, BYOK, TON Connect, and 4 user roles.

**Live:** https://routertext.ru  
**Bot:** @Routeragentbot  

## Architecture
```
Frontend (React + Tailwind + Telegram WebApp SDK)
    ↓ REST API + SSE Streaming
Backend (Node.js + Express + PostgreSQL)
    ↓
LLM Router (auto-refresh + dynamic fallback)
    ↓
Providers: OpenRouter (15+ free) | HuggingFace
```

## 4 Roles

| Role | Description |
|------|-------------|
| 💬 **User** | Chat with LLM, personas, modes, private mode |
| 🏢 **Business** | Team management, budget control, usage dashboard |
| 🤖 **AI Agents** | Agent builder, orchestrator, prompt marketplace |
| ⌨️ **Developer** | BYOK keys, API docs, playground, usage metrics |

## Features

### Chat
- SSE streaming (real-time text generation)
- 4 personas (Coder, Translator, Analyst, Writer)
- 3 modes (⚡ Fast / 🧠 Precise / 💰 Economy)
- 🔒 Private mode (no history saved)
- Model selection from 15+ free models
- Auto language detection (RU/EN)

### Security
- Telegram initData HMAC-SHA256 validation
- BYOK keys encrypted (AES)
- E2E encryption module (AES-GCM-256, PBKDF2)
- Rate limiting (20 req/min)
- Anti-spam (parallel request blocking)
- Token cap (input length limit)
- Helmet HTTP headers
- SSL/TLS (Let's Encrypt)

### Monetization
- 20 free requests/day limit
- Balance tracking (PostgreSQL)
- Transaction logging
- Telegram Stars & TON payments (planned)

### Infrastructure
- PostgreSQL (users, messages, vault, balances, transactions, visits)
- Auto-refresh free models every 10 min
- Dynamic fallback across all available models
- Docker + docker-compose
- systemd service
- nginx reverse proxy + SSL

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env  # fill in API keys
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker
```bash
docker-compose up --build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Server status |
| GET | /api/models | Available models |
| POST | /api/chat | Send message |
| POST | /api/chat/stream | SSE streaming |
| GET | /api/personas | Chat personas |
| GET | /api/modes | Chat modes |
| GET | /api/stats | Visit statistics |
| POST | /api/stats/visit | Track visit |
| GET | /api/user/:id | User profile |
| POST | /api/user/:id/byok | Save BYOK key |
| GET | /api/session/:id | Chat history |
| DELETE | /api/session/:id | Clear history |
| GET | /api/billing/plans | Billing plans |
| GET | /api/billing/me/:telegramId | Billing profile + payments |
| POST | /api/billing/paywall/:telegramId/open | Track paywall_open |
| POST | /api/billing/checkout/:telegramId | Create checkout |
| POST | /api/telegram/webhook | Telegram payment webhook |
| POST | /api/billing/admin/subscription/maintenance/run | Manual maintenance |
| GET | /api/billing/admin/analytics/funnel | Funnel analytics report |

## Stack
- **Frontend:** React 18 + Vite + Tailwind CSS + Telegram WebApp SDK + TON Connect
- **Backend:** Node.js 20 + Express + PostgreSQL + crypto-js
- **LLM:** OpenRouter (free models, auto-refresh) + HuggingFace
- **Infra:** Ubuntu 24, nginx, Let's Encrypt, systemd, Docker

## License
MIT
