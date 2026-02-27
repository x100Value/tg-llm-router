const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BILLING_DEFAULT_PROVIDER = process.env.BILLING_DEFAULT_PROVIDER || 'telegram_stars';
const BILLING_CURRENCY = process.env.BILLING_CURRENCY || 'XTR';
const TELEGRAM_INVOICE_PREFIX = process.env.TELEGRAM_INVOICE_PREFIX || 'rtx';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SUBSCRIPTION_GRACE_DAYS = parseInt(process.env.SUBSCRIPTION_GRACE_DAYS || '3', 10);
const BILLING_FUNNEL_EVENTS = ['paywall_open', 'checkout', 'pre_checkout', 'successful_payment'];

const DEFAULT_PLANS = [
  {
    code: 'lite',
    name: 'Lite',
    description: 'Entry plan with increased limits',
    price_xtr: 99,
    interval_days: 30,
    features: { dailyCap: 200, priority: 'standard', modelTier: 'free_plus' },
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Main subscription for active users',
    price_xtr: 299,
    interval_days: 30,
    features: { dailyCap: 1000, priority: 'high', modelTier: 'pro' },
  },
  {
    code: 'max',
    name: 'Max',
    description: 'Highest limits and max priority',
    price_xtr: 799,
    interval_days: 30,
    features: { dailyCap: 5000, priority: 'max', modelTier: 'max' },
  },
];

class BillingService {
  async init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS plans (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price_xtr INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XTR',
      interval_days INTEGER NOT NULL DEFAULT 30,
      features JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      plan_code TEXT NOT NULL REFERENCES plans(code),
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      external_subscription_id TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_tg_status
      ON subscriptions(telegram_id, status, current_period_end DESC)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS payments (
      id BIGSERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_payment_id TEXT NOT NULL,
      plan_code TEXT REFERENCES plans(code),
      idempotency_key TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XTR',
      status TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, external_payment_id)
    )`);

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_user_idem
      ON payments(telegram_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL`);

    await pool.query(`CREATE TABLE IF NOT EXISTS billing_funnel_events (
      id BIGSERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      event TEXT NOT NULL,
      plan_code TEXT,
      provider TEXT,
      payment_external_id TEXT,
      source TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_funnel_created
      ON billing_funnel_events(created_at DESC)`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_funnel_event_created
      ON billing_funnel_events(event, created_at DESC)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS entitlements (
      id BIGSERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      source TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(telegram_id, key, source)
    )`);

    await this.seedDefaultPlans();
  }

  buildInvoicePayload(telegramId, planCode, externalPaymentId) {
    return `${TELEGRAM_INVOICE_PREFIX}|p:${externalPaymentId}|plan:${planCode}|uid:${telegramId}`;
  }

  parseInvoicePayload(payload) {
    const raw = String(payload || '').trim();
    if (!raw) return { planCode: '', externalPaymentId: '', telegramId: '' };

    if (raw.startsWith('{')) {
      try {
        const json = JSON.parse(raw);
        return {
          planCode: String(json.planCode || json.plan || '').trim(),
          externalPaymentId: String(json.externalPaymentId || json.paymentId || '').trim(),
          telegramId: String(json.telegramId || json.uid || '').trim(),
        };
      } catch {
        // fallback to token parsing
      }
    }

    const parts = raw.split('|');
    const parsed = { planCode: '', externalPaymentId: '', telegramId: '' };

    for (const part of parts) {
      if (part.startsWith('plan:')) parsed.planCode = part.slice(5);
      if (part.startsWith('p:')) parsed.externalPaymentId = part.slice(2);
      if (part.startsWith('uid:')) parsed.telegramId = part.slice(4);
    }

    return parsed;
  }

  buildTelegramStarsDraft(plan, invoicePayload) {
    return {
      type: 'telegram_stars_invoice_draft',
      title: `${plan.name} Plan`,
      description: plan.description || `${plan.name} subscription`,
      payload: invoicePayload,
      currency: plan.currency || BILLING_CURRENCY,
      prices: [{ label: `${plan.name} (${plan.interval_days}d)`, amount: plan.price_xtr }],
      invoiceLink: null,
      error: null,
    };
  }

  async createTelegramStarsInvoiceLink(plan, invoicePayload) {
    const draft = this.buildTelegramStarsDraft(plan, invoicePayload);
    if (!BOT_TOKEN) {
      return { ...draft, error: 'BOT_TOKEN missing' };
    }

    const params = new URLSearchParams();
    params.set('title', String(draft.title).slice(0, 32));
    params.set('description', String(draft.description).slice(0, 255));
    params.set('payload', invoicePayload);
    params.set('currency', draft.currency);
    params.set('prices', JSON.stringify(draft.prices));

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.result) {
        return {
          ...draft,
          error: String(data?.description || `createInvoiceLink failed (${response.status})`),
        };
      }

      return {
        ...draft,
        type: 'telegram_stars_invoice',
        invoiceLink: data.result,
        error: null,
      };
    } catch (err) {
      return {
        ...draft,
        error: String(err?.message || 'createInvoiceLink failed'),
      };
    }
  }

  async buildProviderPayload(provider, plan, invoicePayload) {
    const normalizedProvider = String(provider || BILLING_DEFAULT_PROVIDER).trim();
    if (normalizedProvider === 'telegram_stars') {
      return this.createTelegramStarsInvoiceLink(plan, invoicePayload);
    }
    return null;
  }

  normalizeWebhookEvent(event) {
    const rawUpdate = event?.rawUpdate || null;

    const successfulPayment =
      rawUpdate?.message?.successful_payment ||
      event?.successful_payment ||
      null;

    if (successfulPayment) {
      const parsed = this.parseInvoicePayload(successfulPayment.invoice_payload);
      const telegramId = String(
        rawUpdate?.message?.from?.id ||
        event?.telegramId ||
        parsed.telegramId ||
        ''
      ).trim();

      const externalPaymentId = String(
        parsed.externalPaymentId ||
        successfulPayment.telegram_payment_charge_id ||
        successfulPayment.provider_payment_charge_id ||
        event?.externalPaymentId ||
        ''
      ).trim();

      return {
        provider: 'telegram_stars',
        externalPaymentId,
        externalSubscriptionId: event?.externalSubscriptionId || null,
        telegramId,
        planCode: String(event?.planCode || parsed.planCode || '').trim(),
        amount: Number(event?.amount || successfulPayment.total_amount || 0),
        currency: String(event?.currency || successfulPayment.currency || BILLING_CURRENCY),
        status: String(event?.status || 'succeeded').toLowerCase(),
        metadata: {
          ...(event?.metadata || {}),
          telegramUpdateId: rawUpdate?.update_id || null,
          telegramMessageId: rawUpdate?.message?.message_id || null,
          invoicePayload: successfulPayment.invoice_payload || null,
          telegramPaymentChargeId: successfulPayment.telegram_payment_charge_id || null,
          providerPaymentChargeId: successfulPayment.provider_payment_charge_id || null,
        },
      };
    }

    return {
      provider: String(event?.provider || BILLING_DEFAULT_PROVIDER),
      externalPaymentId: String(event?.externalPaymentId || '').trim(),
      externalSubscriptionId: event?.externalSubscriptionId || null,
      telegramId: String(event?.telegramId || '').trim(),
      planCode: String(event?.planCode || '').trim(),
      amount: Number(event?.amount || 0),
      currency: String(event?.currency || BILLING_CURRENCY),
      status: String(event?.status || '').trim().toLowerCase(),
      metadata: event?.metadata || {},
    };
  }

  async seedDefaultPlans() {
    for (const plan of DEFAULT_PLANS) {
      await pool.query(
        `INSERT INTO plans(code,name,description,price_xtr,currency,interval_days,features,active,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,TRUE,NOW())
         ON CONFLICT(code) DO NOTHING`,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.price_xtr,
          BILLING_CURRENCY,
          plan.interval_days,
          JSON.stringify(plan.features || {}),
        ]
      );
    }
  }

  async listPlans() {
    const { rows } = await pool.query(
      `SELECT code,name,description,price_xtr,currency,interval_days,features
       FROM plans
       WHERE active=TRUE
       ORDER BY price_xtr ASC`
    );
    return rows;
  }

  async getPlan(planCode) {
    const { rows } = await pool.query(
      'SELECT code,name,description,price_xtr,currency,interval_days,features,active FROM plans WHERE code=$1',
      [planCode]
    );
    return rows[0] || null;
  }

  async getBillingMe(telegramId) {
    const activeSub = await this.getActiveSubscription(telegramId);
    const entitlements = await this.getEntitlements(telegramId);
    const { rows: payments } = await pool.query(
      `SELECT id, provider, external_payment_id, plan_code, amount, currency, status, created_at
       FROM payments
       WHERE telegram_id=$1
       ORDER BY created_at DESC
       LIMIT 20`,
      [telegramId]
    );

    return { subscription: activeSub, entitlements, payments };
  }

  normalizeFunnelEventName(eventName) {
    const name = String(eventName || '').trim().toLowerCase();
    return BILLING_FUNNEL_EVENTS.includes(name) ? name : '';
  }

  async trackFunnelEvent(input = {}) {
    const eventName = this.normalizeFunnelEventName(input?.event);
    const telegramId = String(input?.telegramId || '').trim();
    if (!eventName || !telegramId) return { ok: false, skipped: true };

    const planCode = String(input?.planCode || '').trim().slice(0, 64) || null;
    const provider = String(input?.provider || '').trim().slice(0, 64) || null;
    const paymentExternalId = String(input?.paymentExternalId || '').trim().slice(0, 128) || null;
    const source = String(input?.source || '').trim().slice(0, 64) || null;
    const metadata = input?.metadata && typeof input.metadata === 'object' ? input.metadata : {};

    await pool.query(
      `INSERT INTO billing_funnel_events(
        telegram_id, event, plan_code, provider, payment_external_id, source, metadata
      ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        telegramId,
        eventName,
        planCode,
        provider,
        paymentExternalId,
        source,
        JSON.stringify(metadata),
      ]
    );

    return { ok: true, skipped: false, event: eventName };
  }

  async getFunnelSummary(hours = 24) {
    const parsedHours = parseInt(hours, 10);
    const windowHours =
      Number.isFinite(parsedHours) && parsedHours > 0
        ? Math.min(parsedHours, 24 * 90)
        : 24;

    const { rows } = await pool.query(
      `SELECT event, COUNT(*)::int AS total, COUNT(DISTINCT telegram_id)::int AS users
       FROM billing_funnel_events
       WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour')
       GROUP BY event`,
      [windowHours]
    );

    const byEvent = new Map(rows.map((row) => [String(row.event), {
      total: row.total || 0,
      users: row.users || 0,
    }]));

    const counts = BILLING_FUNNEL_EVENTS.map((event) => ({
      event,
      total: byEvent.get(event)?.total || 0,
      users: byEvent.get(event)?.users || 0,
    }));

    const paywallOpen = byEvent.get('paywall_open')?.total || 0;
    const checkout = byEvent.get('checkout')?.total || 0;
    const preCheckout = byEvent.get('pre_checkout')?.total || 0;
    const successfulPayment = byEvent.get('successful_payment')?.total || 0;

    return {
      windowHours,
      counts,
      conversion: {
        paywallToCheckoutPct: paywallOpen > 0 ? Number(((checkout / paywallOpen) * 100).toFixed(2)) : 0,
        checkoutToPreCheckoutPct: checkout > 0 ? Number(((preCheckout / checkout) * 100).toFixed(2)) : 0,
        preCheckoutToPaidPct: preCheckout > 0 ? Number(((successfulPayment / preCheckout) * 100).toFixed(2)) : 0,
        checkoutToPaidPct: checkout > 0 ? Number(((successfulPayment / checkout) * 100).toFixed(2)) : 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getActiveSubscription(telegramId) {
    const { rows } = await pool.query(
      `SELECT id, telegram_id, plan_code, provider, status, current_period_end, cancel_at_period_end, metadata
       FROM subscriptions
       WHERE telegram_id=$1
         AND status='active'
         AND (current_period_end IS NULL OR current_period_end > NOW())
       ORDER BY current_period_end DESC NULLS LAST
       LIMIT 1`,
      [telegramId]
    );
    return rows[0] || null;
  }

  async getEntitlements(telegramId) {
    const { rows } = await pool.query(
      `SELECT key, value, source, expires_at
       FROM entitlements
       WHERE telegram_id=$1
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY key ASC`,
      [telegramId]
    );
    return rows;
  }

  async createCheckout(telegramId, planCode, provider, idempotencyKey, metadata = {}) {
    const plan = await this.getPlan(planCode);
    if (!plan || !plan.active) {
      const err = new Error('Plan not found');
      err.code = 'PLAN_NOT_FOUND';
      throw err;
    }

    const normalizedProvider = String(provider || BILLING_DEFAULT_PROVIDER).trim();
    const normalizedIdem = String(idempotencyKey || '').trim().slice(0, 128) || null;

    if (normalizedIdem) {
      const existing = await pool.query(
        `SELECT id, external_payment_id, plan_code, amount, currency, status, provider, payload, created_at
         FROM payments
         WHERE telegram_id=$1 AND idempotency_key=$2
         LIMIT 1`,
        [telegramId, normalizedIdem]
      );
      if (existing.rows[0]) {
        return {
          payment: existing.rows[0],
          reused: true,
          plan,
          providerPayload: existing.rows[0].payload?.providerPayload || null,
        };
      }
    }

    const externalPaymentId = `chk_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const invoicePayload = this.buildInvoicePayload(telegramId, plan.code, externalPaymentId);

    const providerPayload = await this.buildProviderPayload(
      normalizedProvider,
      plan,
      invoicePayload
    );

    const payload = {
      ...metadata,
      invoicePayload,
      providerPayload,
      planCode: plan.code,
      telegramId,
    };

    const { rows } = await pool.query(
      `INSERT INTO payments(
        telegram_id, provider, external_payment_id, plan_code, idempotency_key, amount, currency, status, payload, updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb,NOW())
      RETURNING id, external_payment_id, plan_code, amount, currency, status, provider, payload, created_at`,
      [
        telegramId,
        normalizedProvider,
        externalPaymentId,
        plan.code,
        normalizedIdem,
        plan.price_xtr,
        plan.currency || BILLING_CURRENCY,
        JSON.stringify(payload),
      ]
    );

    const payment = rows[0];
    await this.trackFunnelEvent({
      event: 'checkout',
      telegramId,
      planCode: plan.code,
      provider: normalizedProvider,
      paymentExternalId: payment.external_payment_id,
      source: String(metadata?.source || 'checkout_api').slice(0, 64),
      metadata: {
        reused: false,
      },
    });

    return { payment, reused: false, plan, providerPayload };
  }

  async processWebhook(event) {
    const normalized = this.normalizeWebhookEvent(event);

    const provider = normalized.provider;
    const externalPaymentId = normalized.externalPaymentId;
    const status = normalized.status;
    const telegramId = normalized.telegramId;
    const planCode = normalized.planCode;
    const amount = normalized.amount;
    const currency = normalized.currency;
    const metadata = normalized.metadata || {};

    if (!externalPaymentId || !telegramId || !planCode || !status) {
      const err = new Error('Invalid webhook payload');
      err.code = 'INVALID_WEBHOOK_PAYLOAD';
      throw err;
    }

    const plan = await this.getPlan(planCode);
    if (!plan) {
      const err = new Error('Plan not found');
      err.code = 'PLAN_NOT_FOUND';
      throw err;
    }

    const { rows: existingRows } = await pool.query(
      `SELECT id, status FROM payments WHERE provider=$1 AND external_payment_id=$2 LIMIT 1`,
      [provider, externalPaymentId]
    );

    const existing = existingRows[0];
    let shouldApplySubscription = false;

    if (!existing) {
      await pool.query(
        `INSERT INTO payments(
          telegram_id, provider, external_payment_id, plan_code, amount, currency, status, payload, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())`,
        [telegramId, provider, externalPaymentId, planCode, amount || plan.price_xtr, currency, status, JSON.stringify(metadata)]
      );
      shouldApplySubscription = status === 'succeeded';
    } else {
      if (existing.status !== status) {
        await pool.query(
          `UPDATE payments
           SET status=$3, payload=$4::jsonb, updated_at=NOW()
           WHERE provider=$1 AND external_payment_id=$2`,
          [provider, externalPaymentId, status, JSON.stringify(metadata)]
        );
      }
      shouldApplySubscription = status === 'succeeded' && existing.status !== 'succeeded';
    }

    if (shouldApplySubscription) {
      const subscription = await this.activateSubscription(
        telegramId,
        plan,
        provider,
        normalized.externalSubscriptionId || null,
        metadata
      );
      await this.syncEntitlements(telegramId, plan, subscription.current_period_end);
      await this.trackFunnelEvent({
        event: 'successful_payment',
        telegramId,
        planCode,
        provider,
        paymentExternalId: externalPaymentId,
        source: 'webhook',
        metadata: {
          status,
          subscriptionApplied: true,
        },
      });
      return { ok: true, status, subscriptionApplied: true };
    }

    return { ok: true, status, subscriptionApplied: false };
  }

  async activateSubscription(telegramId, plan, provider, externalSubscriptionId, metadata = {}) {
    const { rows: currentRows } = await pool.query(
      `SELECT id, plan_code, current_period_end
       FROM subscriptions
       WHERE telegram_id=$1 AND status='active'
       ORDER BY current_period_end DESC NULLS LAST
       LIMIT 1`,
      [telegramId]
    );

    const current = currentRows[0];
    const now = new Date();
    const intervalDays = Number(plan.interval_days || 30);

    let startFrom = now;
    if (current && current.plan_code === plan.code && current.current_period_end && new Date(current.current_period_end) > now) {
      startFrom = new Date(current.current_period_end);
    }

    const periodEnd = new Date(startFrom.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    if (current) {
      await pool.query(
        `UPDATE subscriptions SET status='expired', updated_at=NOW()
         WHERE id=$1`,
        [current.id]
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO subscriptions(
        telegram_id, plan_code, provider, status, external_subscription_id,
        started_at, current_period_end, cancel_at_period_end, metadata, updated_at
      ) VALUES($1,$2,$3,'active',$4,NOW(),$5,FALSE,$6::jsonb,NOW())
      RETURNING id, telegram_id, plan_code, provider, status, current_period_end`,
      [
        telegramId,
        plan.code,
        provider || BILLING_DEFAULT_PROVIDER,
        externalSubscriptionId,
        periodEnd.toISOString(),
        JSON.stringify(metadata || {}),
      ]
    );

    return rows[0];
  }

  async syncEntitlements(telegramId, plan, expiresAt) {
    const features = plan.features || {};

    await pool.query(
      `DELETE FROM entitlements
       WHERE telegram_id=$1 AND source='plan'`,
      [telegramId]
    );

    const entries = Object.entries(features);
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO entitlements(telegram_id, key, value, source, expires_at, updated_at)
         VALUES($1,$2,$3::jsonb,'plan',$4,NOW())`,
        [telegramId, key, JSON.stringify(value), expiresAt]
      );
    }

    await pool.query(
      `INSERT INTO entitlements(telegram_id, key, value, source, expires_at, updated_at)
       VALUES($1,'plan_code',$2::jsonb,'plan',$3,NOW())
       ON CONFLICT(telegram_id, key, source)
       DO UPDATE SET value=EXCLUDED.value, expires_at=EXCLUDED.expires_at, updated_at=NOW()`,
      [telegramId, JSON.stringify(plan.code), expiresAt]
    );
  }

  getSubscriptionGraceDays() {
    if (!Number.isFinite(SUBSCRIPTION_GRACE_DAYS)) return 0;
    return Math.max(0, SUBSCRIPTION_GRACE_DAYS);
  }

  async getPendingPaymentsStats(minAgeMinutes = 15) {
    const ageMinutesRaw = parseInt(minAgeMinutes, 10);
    const ageMinutes =
      Number.isFinite(ageMinutesRaw) && ageMinutesRaw > 0
        ? ageMinutesRaw
        : 15;

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS count,
         COALESCE(FLOOR(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 60)::int, 0) AS oldest_minutes
       FROM payments
       WHERE status='pending'
         AND created_at <= NOW() - ($1 * INTERVAL '1 minute')`,
      [ageMinutes]
    );

    return {
      minAgeMinutes: ageMinutes,
      count: rows[0]?.count || 0,
      oldestMinutes: rows[0]?.oldest_minutes || 0,
    };
  }

  async listPendingPayments(options = {}) {
    const minAgeRaw = parseInt(options?.minAgeMinutes, 10);
    const minAgeMinutes =
      Number.isFinite(minAgeRaw) && minAgeRaw >= 0
        ? Math.min(minAgeRaw, 60 * 24 * 365)
        : 15;

    const limitRaw = parseInt(options?.limit, 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 500)
        : 100;

    const { rows } = await pool.query(
      `SELECT
         id,
         telegram_id,
         provider,
         external_payment_id,
         plan_code,
         amount,
         currency,
         status,
         created_at,
         updated_at,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60)::int AS age_minutes
       FROM payments
       WHERE status='pending'
         AND created_at <= NOW() - ($1 * INTERVAL '1 minute')
       ORDER BY created_at ASC
       LIMIT $2`,
      [minAgeMinutes, limit]
    );

    return {
      minAgeMinutes,
      limit,
      count: rows.length,
      payments: rows,
    };
  }

  async resolvePendingPayment(paymentIdInput, actionInput, options = {}) {
    const paymentId = parseInt(paymentIdInput, 10);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      const err = new Error('Invalid paymentId');
      err.code = 'INVALID_PAYMENT_ID';
      throw err;
    }

    const action = String(actionInput || '').trim().toLowerCase();
    if (action !== 'failed' && action !== 'succeeded') {
      const err = new Error('Invalid action, expected failed|succeeded');
      err.code = 'INVALID_ACTION';
      throw err;
    }

    const { rows } = await pool.query(
      `SELECT
         id, telegram_id, provider, external_payment_id, plan_code, amount, currency, status, payload, created_at, updated_at
       FROM payments
       WHERE id=$1
       LIMIT 1`,
      [paymentId]
    );
    const payment = rows[0];
    if (!payment) {
      const err = new Error('Payment not found');
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    if (payment.status !== 'pending') {
      if (payment.status === action) {
        return {
          ok: true,
          alreadyResolved: true,
          action,
          payment,
        };
      }
      const err = new Error(`Payment is not pending (status=${payment.status})`);
      err.code = 'PAYMENT_NOT_PENDING';
      throw err;
    }

    const reason = String(options?.reason || 'admin_resolve').slice(0, 160);
    const actor = String(options?.actor || 'admin_api').slice(0, 64);
    const resolvedAt = new Date().toISOString();

    if (action === 'failed') {
      const resolutionMeta = {
        adminResolution: {
          action,
          reason,
          actor,
          resolvedAt,
        },
      };

      const updated = await pool.query(
        `UPDATE payments
         SET status='failed',
             payload=COALESCE(payload, '{}'::jsonb) || $2::jsonb,
             updated_at=NOW()
         WHERE id=$1
         RETURNING id, telegram_id, provider, external_payment_id, plan_code, amount, currency, status, payload, created_at, updated_at`,
        [paymentId, JSON.stringify(resolutionMeta)]
      );

      return {
        ok: true,
        alreadyResolved: false,
        action,
        payment: updated.rows[0],
      };
    }

    const existingPayload = payment.payload && typeof payment.payload === 'object'
      ? payment.payload
      : {};

    const result = await this.processWebhook({
      provider: payment.provider,
      externalPaymentId: payment.external_payment_id,
      telegramId: payment.telegram_id,
      planCode: payment.plan_code,
      amount: payment.amount,
      currency: payment.currency,
      status: 'succeeded',
      metadata: {
        ...existingPayload,
        adminResolution: {
          action,
          reason,
          actor,
          resolvedAt,
        },
      },
    });

    const refreshed = await pool.query(
      `SELECT
         id, telegram_id, provider, external_payment_id, plan_code, amount, currency, status, payload, created_at, updated_at
       FROM payments
       WHERE id=$1
       LIMIT 1`,
      [paymentId]
    );

    return {
      ok: true,
      alreadyResolved: false,
      action,
      payment: refreshed.rows[0] || payment,
      subscriptionApplied: Boolean(result?.subscriptionApplied),
    };
  }

  async timeoutPendingPayments(options = {}) {
    const minAgeRaw = parseInt(options?.minAgeMinutes, 10);
    const minAgeMinutes =
      Number.isFinite(minAgeRaw) && minAgeRaw > 0
        ? Math.min(minAgeRaw, 60 * 24 * 365)
        : 120;

    const limitRaw = parseInt(options?.limit, 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 1000)
        : 200;

    const reason = String(options?.reason || 'auto_timeout').slice(0, 120);
    const payloadPatch = {
      timeoutResolution: {
        reason,
        minAgeMinutes,
        resolvedAt: new Date().toISOString(),
      },
    };

    const { rows } = await pool.query(
      `WITH target AS (
         SELECT id
         FROM payments
         WHERE status='pending'
           AND created_at <= NOW() - ($1 * INTERVAL '1 minute')
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE payments p
       SET status='failed',
           payload=COALESCE(p.payload, '{}'::jsonb) || $3::jsonb,
           updated_at=NOW()
       FROM target t
       WHERE p.id=t.id
       RETURNING p.id, p.telegram_id, p.external_payment_id, p.provider, p.plan_code, p.created_at, p.updated_at`,
      [minAgeMinutes, limit, JSON.stringify(payloadPatch)]
    );

    return {
      ok: true,
      minAgeMinutes,
      limit,
      affected: rows.length,
      payments: rows,
      ranAt: new Date().toISOString(),
    };
  }

  async runSubscriptionMaintenance(options = {}) {
    const dryRun = options?.dryRun === true;
    const reason = String(options?.reason || 'scheduler').slice(0, 64);
    const graceDays = this.getSubscriptionGraceDays();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const movedToGrace = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM subscriptions
         WHERE status='active'
           AND current_period_end IS NOT NULL
           AND current_period_end <= NOW()
           AND current_period_end > NOW() - ($1 * INTERVAL '1 day')`,
        [graceDays]
      );

      const finalized = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM subscriptions
         WHERE status IN ('active','grace')
           AND current_period_end IS NOT NULL
           AND current_period_end <= NOW() - ($1 * INTERVAL '1 day')`,
        [graceDays]
      );

      const entitlementsRevoked = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM entitlements e
         WHERE e.source='plan'
           AND NOT EXISTS (
             SELECT 1
             FROM subscriptions s
             WHERE s.telegram_id=e.telegram_id
               AND (
                 (s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end > NOW() - ($1 * INTERVAL '1 day')))
                 OR
                 (s.status='grace' AND s.current_period_end IS NOT NULL AND s.current_period_end > NOW() - ($1 * INTERVAL '1 day'))
               )
           )`,
        [graceDays]
      );

      if (dryRun) {
        await client.query('ROLLBACK');
        return {
          ok: true,
          dryRun: true,
          reason,
          graceDays,
          movedToGrace: movedToGrace.rows[0]?.c || 0,
          finalized: finalized.rows[0]?.c || 0,
          entitlementsRevoked: entitlementsRevoked.rows[0]?.c || 0,
          ranAt: new Date().toISOString(),
        };
      }

      const movedToGraceResult = await client.query(
        `UPDATE subscriptions
         SET status='grace', updated_at=NOW()
         WHERE status='active'
           AND current_period_end IS NOT NULL
           AND current_period_end <= NOW()
           AND current_period_end > NOW() - ($1 * INTERVAL '1 day')`,
        [graceDays]
      );

      const finalizedResult = await client.query(
        `UPDATE subscriptions
         SET status=CASE WHEN cancel_at_period_end THEN 'canceled' ELSE 'expired' END,
             updated_at=NOW()
         WHERE status IN ('active','grace')
           AND current_period_end IS NOT NULL
           AND current_period_end <= NOW() - ($1 * INTERVAL '1 day')`,
        [graceDays]
      );

      const entitlementsRevokedResult = await client.query(
        `DELETE FROM entitlements e
         WHERE e.source='plan'
           AND NOT EXISTS (
             SELECT 1
             FROM subscriptions s
             WHERE s.telegram_id=e.telegram_id
               AND (
                 (s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end > NOW() - ($1 * INTERVAL '1 day')))
                 OR
                 (s.status='grace' AND s.current_period_end IS NOT NULL AND s.current_period_end > NOW() - ($1 * INTERVAL '1 day'))
               )
           )`,
        [graceDays]
      );

      await client.query('COMMIT');

      return {
        ok: true,
        dryRun: false,
        reason,
        graceDays,
        movedToGrace: movedToGraceResult.rowCount,
        finalized: finalizedResult.rowCount,
        entitlementsRevoked: entitlementsRevokedResult.rowCount,
        ranAt: new Date().toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new BillingService();
