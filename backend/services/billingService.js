const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BILLING_DEFAULT_PROVIDER = process.env.BILLING_DEFAULT_PROVIDER || 'telegram_stars';
const BILLING_CURRENCY = process.env.BILLING_CURRENCY || 'XTR';

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

    const normalizedIdem = String(idempotencyKey || '').trim().slice(0, 128) || null;
    if (normalizedIdem) {
      const existing = await pool.query(
        `SELECT id, external_payment_id, plan_code, amount, currency, status, provider, created_at
         FROM payments
         WHERE telegram_id=$1 AND idempotency_key=$2
         LIMIT 1`,
        [telegramId, normalizedIdem]
      );
      if (existing.rows[0]) {
        return { payment: existing.rows[0], reused: true, plan };
      }
    }

    const externalPaymentId = `chk_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const { rows } = await pool.query(
      `INSERT INTO payments(
        telegram_id, provider, external_payment_id, plan_code, idempotency_key, amount, currency, status, payload, updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb,NOW())
      RETURNING id, external_payment_id, plan_code, amount, currency, status, provider, created_at`,
      [
        telegramId,
        provider || BILLING_DEFAULT_PROVIDER,
        externalPaymentId,
        plan.code,
        normalizedIdem,
        plan.price_xtr,
        plan.currency || BILLING_CURRENCY,
        JSON.stringify(metadata || {}),
      ]
    );

    return { payment: rows[0], reused: false, plan };
  }

  async processWebhook(event) {
    const provider = String(event.provider || BILLING_DEFAULT_PROVIDER);
    const externalPaymentId = String(event.externalPaymentId || '').trim();
    const status = String(event.status || '').trim().toLowerCase();
    const telegramId = String(event.telegramId || '').trim();
    const planCode = String(event.planCode || '').trim();
    const amount = Number(event.amount || 0);
    const currency = String(event.currency || BILLING_CURRENCY);
    const metadata = event.metadata || {};

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

    if (!existing) {
      await pool.query(
        `INSERT INTO payments(
          telegram_id, provider, external_payment_id, plan_code, amount, currency, status, payload, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())`,
        [telegramId, provider, externalPaymentId, planCode, amount || plan.price_xtr, currency, status, JSON.stringify(metadata)]
      );
    } else if (existing.status !== status) {
      await pool.query(
        `UPDATE payments
         SET status=$3, payload=$4::jsonb, updated_at=NOW()
         WHERE provider=$1 AND external_payment_id=$2`,
        [provider, externalPaymentId, status, JSON.stringify(metadata)]
      );
    }

    if (status === 'succeeded') {
      const subscription = await this.activateSubscription(telegramId, plan, provider, event.externalSubscriptionId || null, metadata);
      await this.syncEntitlements(telegramId, plan, subscription.current_period_end);
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
}

module.exports = new BillingService();
