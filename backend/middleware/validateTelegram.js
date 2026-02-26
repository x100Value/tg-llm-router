const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const INTERNAL_BYPASS_SECRET = process.env.INTERNAL_BYPASS_SECRET || '';

function getInternalUserId(req) {
  return String(
    req.headers['x-internal-user-id'] ||
    req.body?.userId ||
    req.params?.telegramId ||
    req.query?.userId ||
    ''
  ).trim();
}

function tryInternalBypass(req) {
  if (!INTERNAL_BYPASS_SECRET) return false;

  const providedSecret = String(req.headers['x-internal-auth'] || '').trim();
  if (!providedSecret || providedSecret !== INTERNAL_BYPASS_SECRET) return false;

  const userId = getInternalUserId(req);
  if (!/^\d{4,20}$/.test(userId)) return false;

  req.telegramUser = { id: userId, internalBypass: true };
  return true;
}

function validateTelegram(req, res, next) {
  if (process.env.NODE_ENV === 'development' && !BOT_TOKEN) return next();

  const initData = req.headers['x-telegram-init-data'];
  if (!initData) {
    if (tryInternalBypass(req)) return next();
    return res.status(401).json({ error: 'Missing Telegram initData' });
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new Error('No hash');

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (checkHash !== hash) return res.status(401).json({ error: 'Invalid signature' });

    const userStr = params.get('user');
    if (userStr) req.telegramUser = JSON.parse(userStr);
    return next();
  } catch {
    return res.status(401).json({ error: 'initData validation failed' });
  }
}

module.exports = validateTelegram;
