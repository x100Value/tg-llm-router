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
  return normalizeIp(ip) === '127.0.0.1';
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

function requireAdminToken(req, res, next) {
  const configuredToken = String(process.env.BILLING_ADMIN_TOKEN || '').trim();
  if (!configuredToken) {
    return res.status(503).json({ error: 'Billing admin token is not configured' });
  }

  const token = getAdminToken(req);
  if (!token || token !== configuredToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const allowlist = String(process.env.BILLING_ADMIN_IP_ALLOWLIST || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (allowlist.length > 0) {
    const clientIp = getClientIp(req);
    if (!allowlist.includes(clientIp)) {
      return res.status(403).json({ error: 'Forbidden by IP allowlist' });
    }
  }

  return next();
}

module.exports = requireAdminToken;
