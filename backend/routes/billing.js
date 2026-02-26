const express = require('express');
const billingService = require('../services/billingService');
const validateTelegram = require('../middleware/validateTelegram');
const requireTelegramUserMatch = require('../middleware/requireTelegramUserMatch');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

const BILLING_WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET || '';
const BILLING_DEFAULT_PROVIDER = process.env.BILLING_DEFAULT_PROVIDER || 'telegram_stars';

function parseJsonSafe(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return { raw: String(value) };
  }
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

    res.json({
      success: true,
      mode: 'provider_redirect',
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
    });
  } catch (err) {
    if (err.code === 'PLAN_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/billing/webhook', async (req, res) => {
  try {
    if (BILLING_WEBHOOK_SECRET) {
      const got = String(req.headers['x-billing-webhook-secret'] || '');
      if (got !== BILLING_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const result = await billingService.processWebhook({
      provider: req.body?.provider || BILLING_DEFAULT_PROVIDER,
      externalPaymentId: req.body?.externalPaymentId,
      externalSubscriptionId: req.body?.externalSubscriptionId,
      telegramId: req.body?.telegramId,
      planCode: req.body?.planCode,
      amount: req.body?.amount,
      currency: req.body?.currency,
      status: req.body?.status,
      metadata: parseJsonSafe(req.body?.metadata),
    });

    res.json(result);
  } catch (err) {
    if (err.code === 'INVALID_WEBHOOK_PAYLOAD') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'PLAN_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
