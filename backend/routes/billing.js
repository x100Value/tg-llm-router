const express = require('express');
const { Pool } = require('pg');
const billingService = require('../services/billingService');
const alertService = require('../services/alertService');
const validateTelegram = require('../middleware/validateTelegram');
const requireTelegramUserMatch = require('../middleware/requireTelegramUserMatch');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BILLING_WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET || '';
const BILLING_DEFAULT_PROVIDER = process.env.BILLING_DEFAULT_PROVIDER || 'telegram_stars';
const BILLING_ADMIN_TOKEN = process.env.BILLING_ADMIN_TOKEN || '';
const BILLING_ADMIN_IP_ALLOWLIST = String(process.env.BILLING_ADMIN_IP_ALLOWLIST || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const SUBSCRIPTION_GRACE_DAYS = parseInt(process.env.SUBSCRIPTION_GRACE_DAYS || '3', 10);

function parseJsonSafe(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return { raw: String(value) };
  }
}

function getAdminToken(req) {
  const headerToken = String(req.headers['x-billing-admin-token'] || '').trim();
  if (headerToken) return headerToken;

  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return '';
}

function normalizeIp(raw) {
  const ip = String(raw || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function isLoopbackIp(ip) {
  const normalized = normalizeIp(ip);
  return normalized === '127.0.0.1';
}

function getClientIp(req) {
  const remoteIp = normalizeIp(req.socket?.remoteAddress || req.ip || '');
  if (!isLoopbackIp(remoteIp)) return remoteIp;

  const fromRealIp = normalizeIp(req.headers['x-real-ip']);
  if (fromRealIp) return fromRealIp;

  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0];
  const fromForwarded = normalizeIp(fwd);
  if (fromForwarded) return fromForwarded;

  return remoteIp;
}

function requireBillingAdmin(req, res, next) {
  if (!BILLING_ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Billing admin token is not configured' });
  }

  const token = getAdminToken(req);
  if (!token || token !== BILLING_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (BILLING_ADMIN_IP_ALLOWLIST.length > 0) {
    const clientIp = getClientIp(req);
    const allowed = BILLING_ADMIN_IP_ALLOWLIST.includes(clientIp);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden by IP allowlist' });
    }
  }

  next();
}

function computeGrace(subscription) {
  const graceDays = Number.isFinite(SUBSCRIPTION_GRACE_DAYS)
    ? Math.max(0, SUBSCRIPTION_GRACE_DAYS)
    : 0;

  if (!subscription?.current_period_end || graceDays <= 0) {
    return { inGrace: false, graceEndsAt: null, graceDays };
  }

  const endAt = new Date(subscription.current_period_end);
  if (!Number.isFinite(endAt.getTime())) {
    return { inGrace: false, graceEndsAt: null, graceDays };
  }

  const graceEndsAt = new Date(endAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const inGrace =
    String(subscription.status) !== 'active' &&
    endAt.getTime() <= now &&
    graceEndsAt.getTime() > now;

  return { inGrace, graceEndsAt: graceEndsAt.toISOString(), graceDays };
}

router.get('/api/billing/plans', async (req, res) => {
  try {
    const plans = await billingService.listPlans();
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/billing/me/:telegramId', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  try {
    const data = await billingService.getBillingMe(req.params.telegramId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/paywall/:telegramId/open', validateTelegram, requireTelegramUserMatch, rateLimiter, async (req, res) => {
  try {
    const telegramId = req.params.telegramId;
    const planCode = String(req.body?.planCode || '').trim();
    const source = String(req.body?.source || 'app').trim().slice(0, 64);
    const metadata = parseJsonSafe(req.body?.metadata);

    await billingService.trackFunnelEvent({
      event: 'paywall_open',
      telegramId,
      planCode: planCode || null,
      provider: BILLING_DEFAULT_PROVIDER,
      source,
      metadata,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/billing/subscription/:telegramId/status', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  try {
    const telegramId = req.params.telegramId;

    const { rows } = await pool.query(
      `SELECT id, telegram_id, plan_code, provider, status, current_period_end, cancel_at_period_end, metadata, updated_at
       FROM subscriptions
       WHERE telegram_id=$1
       ORDER BY (status='active') DESC, current_period_end DESC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [telegramId]
    );

    const subscription = rows[0] || null;
    const grace = computeGrace(subscription);

    res.json({
      subscription,
      inGrace: grace.inGrace,
      graceEndsAt: grace.graceEndsAt,
      graceDays: grace.graceDays,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/subscription/:telegramId/cancel', validateTelegram, requireTelegramUserMatch, rateLimiter, async (req, res) => {
  try {
    const telegramId = req.params.telegramId;
    const reason = String(req.body?.reason || 'user_requested').slice(0, 120);
    const meta = {
      cancelRequestedAt: new Date().toISOString(),
      cancelReason: reason,
    };

    const { rows } = await pool.query(
      `UPDATE subscriptions
       SET cancel_at_period_end=TRUE,
           metadata=COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE telegram_id=$1
         AND status='active'
         AND (current_period_end IS NULL OR current_period_end > NOW())
       RETURNING id, telegram_id, plan_code, provider, status, current_period_end, cancel_at_period_end, metadata`,
      [telegramId, JSON.stringify(meta)]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'No active subscription to cancel' });
    }

    res.json({ success: true, subscription: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/subscription/:telegramId/resume', validateTelegram, requireTelegramUserMatch, rateLimiter, async (req, res) => {
  try {
    const telegramId = req.params.telegramId;
    const meta = {
      resumedAt: new Date().toISOString(),
      resumeSource: 'user',
    };

    const { rows } = await pool.query(
      `UPDATE subscriptions
       SET cancel_at_period_end=FALSE,
           metadata=COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE telegram_id=$1
         AND status='active'
         AND (current_period_end IS NULL OR current_period_end > NOW())
       RETURNING id, telegram_id, plan_code, provider, status, current_period_end, cancel_at_period_end, metadata`,
      [telegramId, JSON.stringify(meta)]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'No active subscription to resume' });
    }

    res.json({ success: true, subscription: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/checkout/:telegramId', validateTelegram, requireTelegramUserMatch, rateLimiter, async (req, res) => {
  try {
    const telegramId = req.params.telegramId;
    const planCode = String(req.body?.planCode || '').trim();
    const provider = String(req.body?.provider || BILLING_DEFAULT_PROVIDER).trim();
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const metadata = parseJsonSafe(req.body?.metadata);

    if (!planCode) {
      return res.status(400).json({ error: 'planCode required' });
    }

    const checkout = await billingService.createCheckout(telegramId, planCode, provider, idempotencyKey, metadata);

    const mode = checkout.providerPayload?.invoiceLink
      ? 'telegram_open_invoice'
      : 'provider_redirect';

    res.json({
      success: true,
      mode,
      reused: checkout.reused,
      provider,
      plan: {
        code: checkout.plan.code,
        name: checkout.plan.name,
        price_xtr: checkout.plan.price_xtr,
        currency: checkout.plan.currency,
        interval_days: checkout.plan.interval_days,
      },
      payment: checkout.payment,
      providerPayload: checkout.providerPayload || null,
    });
  } catch (err) {
    if (err.code === 'PLAN_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/admin/subscription/activate', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const telegramId = String(req.body?.telegramId || '').trim();
    const planCode = String(req.body?.planCode || '').trim();
    const reason = String(req.body?.reason || 'admin_activate').slice(0, 120);
    const intervalDaysRaw = parseInt(req.body?.intervalDays, 10);

    if (!telegramId || !planCode) {
      return res.status(400).json({ error: 'telegramId and planCode required' });
    }

    const plan = await billingService.getPlan(planCode);
    if (!plan || !plan.active) {
      return res.status(404).json({ error: 'Plan not found', code: 'PLAN_NOT_FOUND' });
    }

    const intervalDays =
      Number.isFinite(intervalDaysRaw) && intervalDaysRaw > 0
        ? intervalDaysRaw
        : Number(plan.interval_days || 30);

    const effectivePlan = { ...plan, interval_days: intervalDays };
    const metadata = {
      source: 'admin',
      reason,
      activatedAt: new Date().toISOString(),
    };

    const subscription = await billingService.activateSubscription(
      telegramId,
      effectivePlan,
      'admin',
      null,
      metadata
    );
    await billingService.syncEntitlements(telegramId, effectivePlan, subscription.current_period_end);

    res.json({
      success: true,
      subscription,
      plan: {
        code: effectivePlan.code,
        interval_days: effectivePlan.interval_days,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/admin/subscription/deactivate', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const telegramId = String(req.body?.telegramId || '').trim();
    const reason = String(req.body?.reason || 'admin_deactivate').slice(0, 120);

    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId required' });
    }

    const meta = {
      deactivatedAt: new Date().toISOString(),
      deactivatedReason: reason,
      source: 'admin',
    };

    const updated = await pool.query(
      `UPDATE subscriptions
       SET status='canceled',
           cancel_at_period_end=TRUE,
           current_period_end=NOW(),
           metadata=COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE telegram_id=$1
         AND status='active'`,
      [telegramId, JSON.stringify(meta)]
    );

    await pool.query(
      `DELETE FROM entitlements
       WHERE telegram_id=$1
         AND source='plan'`,
      [telegramId]
    );

    res.json({
      success: true,
      deactivated: updated.rowCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/admin/subscription/maintenance/run', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || String(req.body?.dryRun || '').toLowerCase() === 'true';
    const result = await billingService.runSubscriptionMaintenance({
      dryRun,
      reason: 'admin_manual',
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/billing/admin/analytics/funnel', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const hours = parseInt(req.query?.hours, 10);
    const summary = await billingService.getFunnelSummary(hours);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/billing/admin/payments/pending', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const minAgeMinutes = parseInt(req.query?.minAgeMinutes, 10);
    const limit = parseInt(req.query?.limit, 10);
    const result = await billingService.listPendingPayments({ minAgeMinutes, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/admin/payments/pending/timeout/run', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const minAgeMinutes = parseInt(req.body?.minAgeMinutes, 10);
    const limit = parseInt(req.body?.limit, 10);
    const reason = String(req.body?.reason || 'admin_timeout_run').slice(0, 120);
    const result = await billingService.timeoutPendingPayments({
      minAgeMinutes,
      limit,
      reason,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/admin/payments/:paymentId/resolve', requireBillingAdmin, rateLimiter, async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    const action = String(req.body?.action || '').trim().toLowerCase();
    const reason = String(req.body?.reason || 'admin_manual_resolve').slice(0, 160);

    const result = await billingService.resolvePendingPayment(paymentId, action, {
      reason,
      actor: 'admin_api',
    });

    res.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'INVALID_PAYMENT_ID' || err.code === 'INVALID_ACTION') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: err.code });
    }
    if (err.code === 'PAYMENT_NOT_PENDING') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    if (err.code === 'PLAN_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: err.code });
    }
    if (err.code === 'INVALID_WEBHOOK_PAYLOAD') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/webhook', async (req, res) => {
  try {
    if (BILLING_WEBHOOK_SECRET) {
      const got = String(req.headers['x-billing-webhook-secret'] || '');
      if (got !== BILLING_WEBHOOK_SECRET) {
        void alertService.notifyBillingWebhookError(
          'billing-webhook',
          'INVALID_SECRET',
          'x-billing-webhook-secret mismatch'
        );
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const body = req.body || {};
    const rawUpdate = body.rawUpdate || body.update || body;
    const successfulPayment = rawUpdate?.message?.successful_payment || body?.successful_payment || null;
    const inferredProvider = successfulPayment
      ? 'telegram_stars'
      : (body.provider || BILLING_DEFAULT_PROVIDER);

    const result = await billingService.processWebhook({
      provider: inferredProvider,
      externalPaymentId: body.externalPaymentId,
      externalSubscriptionId: body.externalSubscriptionId,
      telegramId: body.telegramId,
      planCode: body.planCode,
      amount: body.amount,
      currency: body.currency,
      status: body.status,
      metadata: parseJsonSafe(body.metadata),
      rawUpdate,
      successful_payment: body.successful_payment,
    });

    res.json(result);
  } catch (err) {
    if (err.code === 'INVALID_WEBHOOK_PAYLOAD') {
      void alertService.notifyBillingWebhookError('billing-webhook', err.code, err.message);
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'PLAN_NOT_FOUND') {
      void alertService.notifyBillingWebhookError('billing-webhook', err.code, err.message);
      return res.status(404).json({ error: err.message, code: err.code });
    }
    void alertService.notifyBillingWebhookError('billing-webhook', 'UNHANDLED_ERROR', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
