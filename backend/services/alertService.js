const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || '';
const ALERT_COOLDOWN_SEC = parseInt(process.env.ALERT_COOLDOWN_SEC || '600', 10);
const ALERT_PREFIX = process.env.ALERT_PREFIX || 'TG-LLM ALERT';

class AlertService {
  constructor() {
    this.lastByKey = new Map();
  }

  isEnabled() {
    return Boolean(BOT_TOKEN && ALERT_CHAT_ID);
  }

  shouldSend(key, cooldownSec) {
    const now = Date.now();
    const last = this.lastByKey.get(key) || 0;
    const cooldownMs = Math.max(1, cooldownSec) * 1000;
    if (now - last < cooldownMs) return false;
    this.lastByKey.set(key, now);
    return true;
  }

  async send(key, text, cooldownSec = ALERT_COOLDOWN_SEC) {
    if (!this.isEnabled()) return false;
    if (!this.shouldSend(key, cooldownSec)) return false;

    const body = {
      chat_id: ALERT_CHAT_ID,
      text: `[${ALERT_PREFIX}] ${text}`,
      disable_web_page_preview: true,
    };

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[AlertService] send failed:', errText);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[AlertService] send error:', err.message);
      return false;
    }
  }

  async notifyProviderFailure(stage, provider, model, errorText) {
    const key = `provider-fail:${stage}:${provider}:${model}`;
    const msg = `${stage} provider failure | provider=${provider} | model=${model} | err=${String(errorText).slice(0, 300)}`;
    return this.send(key, msg, 300);
  }

  async notifyBudgetUsage(total, cap) {
    if (!Number.isFinite(cap) || cap <= 0) return false;

    const ratio = total / cap;
    if (ratio >= 1) {
      return this.send('budget-100', `Daily budget reached: ${total}/${cap}`, 1800);
    }
    if (ratio >= 0.9) {
      return this.send('budget-90', `Daily budget at 90%: ${total}/${cap}`, 1800);
    }
    if (ratio >= 0.8) {
      return this.send('budget-80', `Daily budget at 80%: ${total}/${cap}`, 1800);
    }

    return false;
  }

  async notify5xxSpike(count, windowSec) {
    return this.send('5xx-spike', `5xx spike detected: ${count} errors in ${windowSec}s`, 600);
  }

  async notifyGuardUnavailable(name) {
    return this.send(`guard-unavailable:${name}`, `Guard unavailable: ${name}`, 900);
  }
}

module.exports = new AlertService();
