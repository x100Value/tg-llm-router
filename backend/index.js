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
const { trimContextToLimit } = require('./middleware/tokenCap');
const promptShield = require('./middleware/promptShield');
const validateTelegram = require('./middleware/validateTelegram');
const requireTelegramUserMatch = require('./middleware/requireTelegramUserMatch');

const statsRoutes = require('./routes/stats');
const personasRoutes = require('./routes/personas');
const modesRoutes = require('./routes/modes');
const billingRoutes = require('./routes/billing');
const telegramWebhookRoutes = require('./routes/telegramWebhook');
const llmRouter = require('./router/llmRouter');
const userService = require('./services/userService');
const billingService = require('./services/billingService');
const alertService = require('./services/alertService');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES || '10', 10);
const SUBSCRIPTION_MAINTENANCE_ENABLED = (process.env.SUBSCRIPTION_MAINTENANCE_ENABLED || 'true').toLowerCase() !== 'false';
const SUBSCRIPTION_MAINTENANCE_INTERVAL_SEC = parseInt(process.env.SUBSCRIPTION_MAINTENANCE_INTERVAL_SEC || '600', 10);
const PENDING_PAYMENT_ALERT_ENABLED = (process.env.PENDING_PAYMENT_ALERT_ENABLED || 'true').toLowerCase() !== 'false';
const PENDING_PAYMENT_ALERT_INTERVAL_SEC = parseInt(process.env.PENDING_PAYMENT_ALERT_INTERVAL_SEC || '300', 10);
const PENDING_PAYMENT_ALERT_MIN_AGE_MIN = parseInt(process.env.PENDING_PAYMENT_ALERT_MIN_AGE_MIN || '15', 10);
const PENDING_PAYMENT_ALERT_MIN_COUNT = parseInt(process.env.PENDING_PAYMENT_ALERT_MIN_COUNT || '1', 10);
const PENDING_PAYMENT_TIMEOUT_ENABLED = (process.env.PENDING_PAYMENT_TIMEOUT_ENABLED || 'true').toLowerCase() !== 'false';
const PENDING_PAYMENT_TIMEOUT_INTERVAL_SEC = parseInt(process.env.PENDING_PAYMENT_TIMEOUT_INTERVAL_SEC || '900', 10);
const PENDING_PAYMENT_TIMEOUT_MAX_AGE_MIN = parseInt(process.env.PENDING_PAYMENT_TIMEOUT_MAX_AGE_MIN || '120', 10);
const PENDING_PAYMENT_TIMEOUT_BATCH_LIMIT = parseInt(process.env.PENDING_PAYMENT_TIMEOUT_BATCH_LIMIT || '200', 10);

let subscriptionMaintenanceRunning = false;
let subscriptionMaintenanceTimer = null;
let pendingPaymentAlertRunning = false;
let pendingPaymentAlertTimer = null;
let pendingPaymentTimeoutRunning = false;
let pendingPaymentTimeoutTimer = null;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(logger);
app.use(statsRoutes);
app.use(personasRoutes);
app.use(modesRoutes);
app.use(billingRoutes);
app.use(telegramWebhookRoutes);

function getIdempotencyKey(req) {
  const fromHeader = req.headers['x-idempotency-key'];
  const fromBody = req.body?.requestId;
  return String(fromHeader || fromBody || '').trim().slice(0, 128);
}

function mapClientFacingError(err) {
  const raw = String(err?.message || 'Internal error');

  if (raw.includes('No endpoints found matching your data policy')) {
    return {
      status: 503,
      code: 'OPENROUTER_POLICY_BLOCK',
      message: 'Модель временно недоступна из-за политики OpenRouter. Попробуйте позже.',
    };
  }

  if (raw.includes('All LLM providers failed')) {
    return {
      status: 503,
      code: 'LLM_PROVIDERS_UNAVAILABLE',
      message: 'Сервис ИИ временно недоступен. Попробуйте через минуту.',
    };
  }

  return {
    status: 500,
    code: 'LLM_REQUEST_FAILED',
    message: 'Внутренняя ошибка сервиса. Попробуйте позже.',
  };
}

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

async function runSubscriptionMaintenanceTick(trigger) {
  if (!SUBSCRIPTION_MAINTENANCE_ENABLED) return;
  if (subscriptionMaintenanceRunning) return;

  subscriptionMaintenanceRunning = true;
  try {
    const result = await billingService.runSubscriptionMaintenance({ reason: trigger || 'interval' });
    if (result.movedToGrace || result.finalized || result.entitlementsRevoked) {
      console.log(
        `[BillingMaintenance] movedToGrace=${result.movedToGrace} finalized=${result.finalized} entitlementsRevoked=${result.entitlementsRevoked}`
      );
    }
  } catch (err) {
    console.error('[BillingMaintenance] failed:', err.message);
  } finally {
    subscriptionMaintenanceRunning = false;
  }
}

function startSubscriptionMaintenance() {
  if (!SUBSCRIPTION_MAINTENANCE_ENABLED) {
    console.log('[BillingMaintenance] disabled');
    return;
  }

  const intervalSec = Number.isFinite(SUBSCRIPTION_MAINTENANCE_INTERVAL_SEC) && SUBSCRIPTION_MAINTENANCE_INTERVAL_SEC > 0
    ? SUBSCRIPTION_MAINTENANCE_INTERVAL_SEC
    : 600;

  runSubscriptionMaintenanceTick('startup').catch(() => {});

  subscriptionMaintenanceTimer = setInterval(() => {
    runSubscriptionMaintenanceTick('interval').catch(() => {});
  }, intervalSec * 1000);

  if (typeof subscriptionMaintenanceTimer.unref === 'function') {
    subscriptionMaintenanceTimer.unref();
  }

  console.log(`[BillingMaintenance] enabled interval=${intervalSec}s`);
}

async function runPendingPaymentAlertTick(trigger) {
  if (!PENDING_PAYMENT_ALERT_ENABLED) return;
  if (pendingPaymentAlertRunning) return;

  pendingPaymentAlertRunning = true;
  try {
    const stats = await billingService.getPendingPaymentsStats(PENDING_PAYMENT_ALERT_MIN_AGE_MIN);
    const minCount =
      Number.isFinite(PENDING_PAYMENT_ALERT_MIN_COUNT) && PENDING_PAYMENT_ALERT_MIN_COUNT > 0
        ? PENDING_PAYMENT_ALERT_MIN_COUNT
        : 1;

    if (stats.count >= minCount) {
      await alertService.notifyPendingPaymentsStale(stats.count, stats.oldestMinutes, stats.minAgeMinutes);
      console.log(
        `[BillingPendingMonitor] trigger=${trigger || 'interval'} count=${stats.count} oldest=${stats.oldestMinutes}m threshold=${stats.minAgeMinutes}m`
      );
    }
  } catch (err) {
    console.error('[BillingPendingMonitor] failed:', err.message);
  } finally {
    pendingPaymentAlertRunning = false;
  }
}

function startPendingPaymentMonitor() {
  if (!PENDING_PAYMENT_ALERT_ENABLED) {
    console.log('[BillingPendingMonitor] disabled');
    return;
  }

  const intervalSec = Number.isFinite(PENDING_PAYMENT_ALERT_INTERVAL_SEC) && PENDING_PAYMENT_ALERT_INTERVAL_SEC > 0
    ? PENDING_PAYMENT_ALERT_INTERVAL_SEC
    : 300;

  runPendingPaymentAlertTick('startup').catch(() => {});

  pendingPaymentAlertTimer = setInterval(() => {
    runPendingPaymentAlertTick('interval').catch(() => {});
  }, intervalSec * 1000);

  if (typeof pendingPaymentAlertTimer.unref === 'function') {
    pendingPaymentAlertTimer.unref();
  }

  console.log(`[BillingPendingMonitor] enabled interval=${intervalSec}s age=${PENDING_PAYMENT_ALERT_MIN_AGE_MIN}m`);
}

async function runPendingPaymentTimeoutTick(trigger) {
  if (!PENDING_PAYMENT_TIMEOUT_ENABLED) return;
  if (pendingPaymentTimeoutRunning) return;

  pendingPaymentTimeoutRunning = true;
  try {
    const result = await billingService.timeoutPendingPayments({
      minAgeMinutes: PENDING_PAYMENT_TIMEOUT_MAX_AGE_MIN,
      limit: PENDING_PAYMENT_TIMEOUT_BATCH_LIMIT,
      reason: `scheduler_${trigger || 'interval'}`,
    });

    if (result.affected > 0) {
      console.log(
        `[BillingPendingTimeout] trigger=${trigger || 'interval'} affected=${result.affected} threshold=${result.minAgeMinutes}m batch=${result.limit}`
      );
      await alertService.notifyPendingPaymentsTimedOut(
        result.affected,
        result.minAgeMinutes,
        trigger || 'interval'
      );
    }
  } catch (err) {
    console.error('[BillingPendingTimeout] failed:', err.message);
  } finally {
    pendingPaymentTimeoutRunning = false;
  }
}

function startPendingPaymentTimeout() {
  if (!PENDING_PAYMENT_TIMEOUT_ENABLED) {
    console.log('[BillingPendingTimeout] disabled');
    return;
  }

  const intervalSec =
    Number.isFinite(PENDING_PAYMENT_TIMEOUT_INTERVAL_SEC) && PENDING_PAYMENT_TIMEOUT_INTERVAL_SEC > 0
      ? PENDING_PAYMENT_TIMEOUT_INTERVAL_SEC
      : 900;

  runPendingPaymentTimeoutTick('startup').catch(() => {});

  pendingPaymentTimeoutTimer = setInterval(() => {
    runPendingPaymentTimeoutTick('interval').catch(() => {});
  }, intervalSec * 1000);

  if (typeof pendingPaymentTimeoutTimer.unref === 'function') {
    pendingPaymentTimeoutTimer.unref();
  }

  console.log(
    `[BillingPendingTimeout] enabled interval=${intervalSec}s age=${PENDING_PAYMENT_TIMEOUT_MAX_AGE_MIN}m batch=${PENDING_PAYMENT_TIMEOUT_BATCH_LIMIT}`
  );
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', ...(await userService.stats()), uptime: process.uptime() });
});

app.get('/api/models', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  try {
    const userId = req.query.userId;
    const byok = userId ? await userService.getByokKeys(userId) : {};
    const models = await llmRouter.listAllModels(byok);
    res.json({ models });
  } catch (err) {
    const mapped = mapClientFacingError(err);
    res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
  }
});

app.post('/api/chat', validateTelegram, requireTelegramUserMatch, rateLimiter, antiSpam, globalBudgetGuard, tokenCap, promptShield, async (req, res) => {
  const { userId, model, message } = req.body;
  const requestId = getIdempotencyKey(req);
  const isPrivate = req.body.private === true;
  let reservation = null;
  try {
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

    await userService.getOrCreate(userId);

    const idem = await userService.beginIdempotentRequest(userId, requestId, 'chat');
    if (idem.action === 'replay' && idem.response) {
      return res.json(idem.response);
    }
    if (idem.action === 'in_progress') {
      return res.status(409).json({ error: 'Request already in progress', code: 'REQUEST_IN_PROGRESS' });
    }

    reservation = await reserveQuotaOrReject(userId, res);
    if (!reservation) return;

    if (!isPrivate) await userService.addMessage(userId, 'user', message);

    const session = await userService.getSession(userId);
    const rawMessages = session.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));
    const messages = trimContextToLimit(rawMessages);
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

    const payload = {
      response: result.content,
      model: result.model,
      provider: result.provider,
      fallback: result.fallback,
    };

    await userService.completeIdempotentRequest(userId, requestId, 'chat', payload);
    res.json(payload);
  } catch (err) {
    if (reservation) await rollbackQuotaSafe(userId, reservation, 'Chat');
    await userService.failIdempotentRequest(userId, requestId, 'chat', err.message);

    console.error('[Chat]', err.message);
    const mapped = mapClientFacingError(err);
    res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
  }
});

app.post('/api/chat/stream', validateTelegram, requireTelegramUserMatch, rateLimiter, antiSpam, globalBudgetGuard, tokenCap, promptShield, async (req, res) => {
  const { userId, model, message } = req.body;
  const requestId = getIdempotencyKey(req);
  const isPrivate = req.body.private === true;
  let reservation = null;
  try {
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

    await userService.getOrCreate(userId);

    const idem = await userService.beginIdempotentRequest(userId, requestId, 'stream');
    if (idem.action === 'replay' && idem.response) {
      const cached = idem.response;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      if (cached.response) {
        res.write(`data: ${JSON.stringify({ chunk: cached.response })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, replay: true })}\n\n`);
      return res.end();
    }
    if (idem.action === 'in_progress') {
      return res.status(409).json({ error: 'Request already in progress', code: 'REQUEST_IN_PROGRESS' });
    }

    reservation = await reserveQuotaOrReject(userId, res);
    if (!reservation) return;

    if (!isPrivate) await userService.addMessage(userId, 'user', message);

    const session = await userService.getSession(userId);
    const rawMessages = session.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));
    const messages = trimContextToLimit(rawMessages);
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

    const payload = {
      response: full,
      model: model || null,
      provider: 'stream',
      fallback: false,
    };

    await userService.completeIdempotentRequest(userId, requestId, 'stream', payload);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    if (reservation) await rollbackQuotaSafe(userId, reservation, 'Stream');
    await userService.failIdempotentRequest(userId, requestId, 'stream', err.message);

    console.error('[Stream]', err.message);

    const mapped = mapClientFacingError(err);
    if (!res.headersSent) {
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    } else {
      res.write(`data: ${JSON.stringify({ error: mapped.message, code: mapped.code })}\n\n`);
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
app.use('/api/vault', rateLimiter, validateTelegram, requireTelegramUserMatch, vaultRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
  await userService.init();
  await billingService.init();
  startSubscriptionMaintenance();
  startPendingPaymentMonitor();
  startPendingPaymentTimeout();
  app.listen(PORT, () => {
    console.log(`\nTG-LLM on :${PORT} | DB: ${userService.fallback ? 'memory' : 'postgresql'}\n`);
  });
})();
