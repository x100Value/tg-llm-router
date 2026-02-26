require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const logger = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimiter');
const antiSpam = require('./middleware/antiSpam');
const freeLimit = require("./middleware/freeLimit");
const tokenCap = require("./middleware/tokenCap");
const statsRoutes = require("./routes/stats");
const personasRoutes = require("./routes/personas");
const modesRoutes = require("./routes/modes");
const validateTelegram = require('./middleware/validateTelegram');
const llmRouter = require('./router/llmRouter');
const userService = require('./services/userService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(logger);
app.use(statsRoutes);
app.use(personasRoutes);
app.use(modesRoutes);

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', ...(await userService.stats()), uptime: process.uptime() });
});

app.get('/api/models', async (req, res) => {
  try {
    const userId = req.query.userId;
    const byok = userId ? await userService.getByokKeys(userId) : {};
    const models = await llmRouter.listAllModels(byok);
    res.json({ models });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Regular chat
app.post('/api/chat', validateTelegram, rateLimiter, antiSpam, tokenCap, freeLimit, async (req, res) => {
  try {
    const { userId, model, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });
    await userService.getOrCreate(userId);
    if (req.body.private !== true) await userService.addMessage(userId, "user", message);
    const session = await userService.getSession(userId);
    const messages = session.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const byok = await userService.getByokKeys(userId);
    const result = await llmRouter.chat(model, messages, byok);
    await userService.addMessage(userId, 'assistant', result.content, result.model, result.provider);
    res.json({ response: result.content, model: result.model, provider: result.provider, fallback: result.fallback });
  } catch (err) { console.error('[Chat]', err.message); res.status(500).json({ error: err.message }); }
});

// SSE streaming chat
app.post('/api/chat/stream', validateTelegram, rateLimiter, antiSpam, tokenCap, freeLimit, async (req, res) => {
  try {
    const { userId, model, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });
    await userService.getOrCreate(userId);
    if (req.body.private !== true) await userService.addMessage(userId, "user", message);
    const session = await userService.getSession(userId);
    const messages = session.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const byok = await userService.getByokKeys(userId);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    let full = '';
    for await (const chunk of llmRouter.chatStream(model, messages, byok)) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    await userService.addMessage(userId, 'assistant', full, model, 'stream');
  } catch (err) {
    console.error('[Stream]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); }
  }
});

app.get('/api/user/:telegramId', validateTelegram, async (req, res) => {
  const user = await userService.getOrCreate(req.params.telegramId);
  const keys = user.byok_keys || user.byokKeys || {};
  res.json({ ...user, byokKeys: Object.keys(keys) });
});

app.post('/api/user/:telegramId/settings', validateTelegram, async (req, res) => {
  const user = await userService.updateSettings(req.params.telegramId, req.body);
  res.json({ success: true, settings: user.settings });
});

app.post('/api/user/:telegramId/byok', validateTelegram, async (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) return res.status(400).json({ error: 'provider and apiKey required' });
  const result = await userService.setByokKey(req.params.telegramId, provider, apiKey);
  res.json(result);
});

app.delete('/api/user/:telegramId/byok/:provider', validateTelegram, async (req, res) => {
  const result = await userService.removeByokKey(req.params.telegramId, req.params.provider);
  res.json(result);
});

app.get('/api/session/:telegramId', async (req, res) => {
  const session = await userService.getSession(req.params.telegramId);
  res.json({ messages: session });
});

app.delete('/api/session/:telegramId', async (req, res) => {
  const result = await userService.clearSession(req.params.telegramId);
  res.json(result);
});

// TON routes
const tonRoutes = require('./routes/ton');
const vaultRoutes = require('./routes/vault');
app.use(tonRoutes);
app.use(rateLimiter, vaultRoutes);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html')); });

(async () => {
  await userService.init();
  app.listen(PORT, () => { console.log(`\n🚀 TG-LLM on :${PORT} | DB: ${userService.fallback ? 'memory' : 'postgresql'}\n`); });
})();
