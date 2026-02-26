require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const logger = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimiter');
const antiSpam = require('./middleware/antiSpam');
const globalBudgetGuard = require('./middleware/globalBudgetGuard');
const tokenCap = require('./middleware/tokenCap');
const promptShield = require('./middleware/promptShield');
const validateTelegram = require('./middleware/validateTelegram');
const requireTelegramUserMatch = require('./middleware/requireTelegramUserMatch');

const statsRoutes = require('./routes/stats');
const personasRoutes = require('./routes/personas');
const modesRoutes = require('./routes/modes');

const llmRouter = require('./router/llmRouter');
const userService = require('./services/userService');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES || '10', 10);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(logger);
app.use(statsRoutes);
app.use(personasRoutes);
app.use(modesRoutes);

async function reserveQuotaOrReject(userId, res) {
  try {
    const reservation = await userService.reserveRequest(userId);
    if (typeof reservation.remaining === 'number') {
      res.setHeader('X-Remaining', reservation.remaining);
    }
    return reservation;
  } catch (err) {
    if (err && err.code === 'LIMIT_REACHED') {
      res.status(402).json({ error: err.message, limit: true, remaining: 0 });
      return null;
    }

    if (err && err.code === 'USER_DAILY_CAP_REACHED') {
      res.status(429).json({ error: err.message, limit: true, code: err.code });
      return null;
    }

    throw err;
  }
}

async function rollbackQuotaSafe(userId, reservation, context) {
  try {
    await userService.rollbackRequest(userId, reservation);
  } catch (rollbackErr) {
    console.error(`[${context}] rollback failed:`, rollbackErr.message);
  }
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', ...(await userService.stats()), uptime: process.uptime() });
});

app.get('/api/models', async (req, res) => {
  try {
    const userId = req.query.userId;
    const byok = userId ? await userService.getByokKeys(userId) : {};
    const models = await llmRouter.listAllModels(byok);
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', validateTelegram, requireTelegramUserMatch, rateLimiter, antiSpam, globalBudgetGuard, tokenCap, promptShield, async (req, res) => {
  const { userId, model, message } = req.body;
  const isPrivate = req.body.private === true;
  let reservation = null;

  try {
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

    await userService.getOrCreate(userId);
    reservation = await reserveQuotaOrReject(userId, res);
    if (!reservation) return;

    if (!isPrivate) await userService.addMessage(userId, 'user', message);

    const session = await userService.getSession(userId);
    const messages = session.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));
    const byok = await userService.getByokKeys(userId);
    const result = await llmRouter.chat(model, messages, byok);

    if (!isPrivate) {
      await userService.addMessage(userId, 'assistant', result.content, result.model, result.provider);
    }

    await userService.finalizeRequest(userId, reservation, {
      endpoint: 'chat',
      model: result.model,
      provider: result.provider,
      fallback: !!result.fallback,
    });

    res.json({ response: result.content, model: result.model, provider: result.provider, fallback: result.fallback });
  } catch (err) {
    if (reservation) await rollbackQuotaSafe(userId, reservation, 'Chat');
    console.error('[Chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/stream', validateTelegram, requireTelegramUserMatch, rateLimiter, antiSpam, globalBudgetGuard, tokenCap, promptShield, async (req, res) => {
  const { userId, model, message } = req.body;
  const isPrivate = req.body.private === true;
  let reservation = null;

  try {
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

    await userService.getOrCreate(userId);
    reservation = await reserveQuotaOrReject(userId, res);
    if (!reservation) return;

    if (!isPrivate) await userService.addMessage(userId, 'user', message);

    const session = await userService.getSession(userId);
    const messages = session.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));
    const byok = await userService.getByokKeys(userId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let full = '';
    for await (const chunk of llmRouter.chatStream(model, messages, byok)) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    if (!isPrivate) {
      await userService.addMessage(userId, 'assistant', full, model, 'stream');
    }

    await userService.finalizeRequest(userId, reservation, {
      endpoint: 'stream',
      model: model || null,
      provider: 'stream',
      fallback: false,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    if (reservation) await rollbackQuotaSafe(userId, reservation, 'Stream');
    console.error('[Stream]', err.message);

    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

app.get('/api/user/:telegramId', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  const user = await userService.getOrCreate(req.params.telegramId);
  const keys = user.byok_keys || user.byokKeys || {};
  res.json({ ...user, byokKeys: Object.keys(keys) });
});

app.post('/api/user/:telegramId/settings', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  const user = await userService.updateSettings(req.params.telegramId, req.body);
  res.json({ success: true, settings: user.settings });
});

app.post('/api/user/:telegramId/byok', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) return res.status(400).json({ error: 'provider and apiKey required' });
  const result = await userService.setByokKey(req.params.telegramId, provider, apiKey);
  res.json(result);
});

app.delete('/api/user/:telegramId/byok/:provider', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  const result = await userService.removeByokKey(req.params.telegramId, req.params.provider);
  res.json(result);
});

app.get('/api/session/:telegramId', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  const session = await userService.getSession(req.params.telegramId);
  res.json({ messages: session });
});

app.delete('/api/session/:telegramId', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  const result = await userService.clearSession(req.params.telegramId);
  res.json(result);
});

const tonRoutes = require('./routes/ton');
const vaultRoutes = require('./routes/vault');
app.use(tonRoutes);
app.use(rateLimiter, vaultRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
  await userService.init();
  app.listen(PORT, () => {
    console.log(`\nTG-LLM on :${PORT} | DB: ${userService.fallback ? 'memory' : 'postgresql'}\n`);
  });
})();
