const express = require('express');
const billingService = require('../services/billingService');

const router = express.Router();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

async function callTelegram(method, payload) {
  if (!BOT_TOKEN) {
    const err = new Error('BOT_TOKEN missing');
    err.code = 'BOT_TOKEN_MISSING';
    throw err;
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    const err = new Error(String(data?.description || `${method} failed (${response.status})`));
    err.code = 'TELEGRAM_API_ERROR';
    throw err;
  }

  return data.result;
}

router.post('/api/telegram/webhook', async (req, res) => {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const token = String(req.headers['x-telegram-bot-api-secret-token'] || '');
      if (token !== TELEGRAM_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid Telegram webhook secret' });
      }
    }

    const update = req.body || {};
    const preCheckout = update.pre_checkout_query || null;
    const successfulPayment = update?.message?.successful_payment || null;

    let preCheckoutApproved = false;
    if (preCheckout?.id) {
      await callTelegram('answerPreCheckoutQuery', {
        pre_checkout_query_id: preCheckout.id,
        ok: true,
      });
      preCheckoutApproved = true;
    }

    let billing = null;
    if (successfulPayment) {
      billing = await billingService.processWebhook({
        provider: 'telegram_stars',
        rawUpdate: update,
      });
    }

    res.json({
      ok: true,
      preCheckoutApproved,
      billing,
      ignored: !preCheckout && !successfulPayment,
    });
  } catch (err) {
    console.error('[TelegramWebhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
