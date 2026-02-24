// middleware/logger.js — Request logging for analytics
function logger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.body?.userId || '-';
    const status = res.statusCode;
    const log = `[${new Date().toISOString()}] ${method} ${url} | user:${userId} | ${status} | ${duration}ms`;
    console.log(log);
  });

  next();
}

module.exports = logger;
