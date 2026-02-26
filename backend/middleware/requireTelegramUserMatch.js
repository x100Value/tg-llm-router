function getAuthenticatedTelegramId(req) {
  return req.telegramUser && req.telegramUser.id ? String(req.telegramUser.id) : null;
}

function getRequestedUserId(req) {
  if (req.body && req.body.userId != null) return String(req.body.userId);
  if (req.params && req.params.telegramId != null) return String(req.params.telegramId);
  if (req.query && req.query.userId != null) return String(req.query.userId);
  return null;
}

function requireTelegramUserMatch(req, res, next) {
  const telegramId = getAuthenticatedTelegramId(req);
  if (!telegramId) return res.status(401).json({ error: 'Telegram user missing in initData' });

  const requestedUserId = getRequestedUserId(req);
  if (!requestedUserId) return res.status(400).json({ error: 'userId or telegramId required' });

  if (telegramId !== requestedUserId) {
    return res.status(403).json({ error: 'Telegram user mismatch' });
  }

  req.authenticatedUserId = telegramId;
  next();
}

module.exports = requireTelegramUserMatch;
