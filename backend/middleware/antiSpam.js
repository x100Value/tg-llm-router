const activeRequests = new Set();

function antiSpam(req, res, next) {
  const userId = req.body?.userId || 'anon';
  
  // Block parallel requests from same user
  if (activeRequests.has(userId)) {
    return res.status(429).json({ error: 'Wait for previous response' });
  }
  
  activeRequests.add(userId);
  res.on('finish', () => activeRequests.delete(userId));
  res.on('close', () => activeRequests.delete(userId));
  
  next();
}

module.exports = antiSpam;
