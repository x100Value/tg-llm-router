const alertService = require('../services/alertService');

const ALERT_5XX_WINDOW_SEC = parseInt(process.env.ALERT_5XX_WINDOW_SEC || '300', 10);
const ALERT_5XX_THRESHOLD = parseInt(process.env.ALERT_5XX_THRESHOLD || '10', 10);

const errorTimestamps = [];

function track5xxAndAlert(statusCode) {
  if (!Number.isFinite(ALERT_5XX_THRESHOLD) || ALERT_5XX_THRESHOLD <= 0) return;
  if (statusCode < 500) return;

  const now = Date.now();
  const windowMs = Math.max(1, ALERT_5XX_WINDOW_SEC) * 1000;
  errorTimestamps.push(now);

  while (errorTimestamps.length && now - errorTimestamps[0] > windowMs) {
    errorTimestamps.shift();
  }

  if (errorTimestamps.length >= ALERT_5XX_THRESHOLD) {
    void alertService.notify5xxSpike(errorTimestamps.length, ALERT_5XX_WINDOW_SEC);
  }
}

function logger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.body?.userId || '-';
    const status = res.statusCode;

    track5xxAndAlert(status);

    const log = `[${new Date().toISOString()}] ${method} ${url} | user:${userId} | ${status} | ${duration}ms`;
    console.log(log);
  });

  next();
}

module.exports = logger;
