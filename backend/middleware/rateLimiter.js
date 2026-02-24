// middleware/rateLimiter.js — Simple in-memory rate limiter
const rateLimits = new Map();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20;     // per window

function rateLimiter(req, res, next) {
  const key = req.body?.userId || req.ip || 'anonymous';
  const now = Date.now();

  if (!rateLimits.has(key)) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return next();
  }

  const entry = rateLimits.get(key);

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    return next();
  }

  if (entry.count >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment.',
      retryAfter: Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000),
    });
  }

  entry.count++;
  next();
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.windowStart > WINDOW_MS * 5) rateLimits.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = rateLimiter;
