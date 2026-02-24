// index.js — Main backend server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimiter');
const llmRouter = require('./router/llmRouter');
const userService = require('./services/userService');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(logger);

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ...userService.stats(), uptime: process.uptime() });
});

// --- Models ---
app.get('/api/models', async (req, res) => {
  try {
    const userId = req.query.userId;
    const byok = userId ? userService.getByokKeys(userId) : {};
    const models = await llmRouter.listAllModels(byok);
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Chat ---
app.post('/api/chat', rateLimiter, async (req, res) => {
  try {
    const { userId, model, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: 'userId and message are required' });
    }

    // Get/create user & session
    userService.getOrCreate(userId);
    userService.addMessage(userId, 'user', message);
    const session = userService.getSession(userId);

    // Build messages array (last 10 for context)
    const messages = session.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Route to LLM
    const byok = userService.getByokKeys(userId);
    const result = await llmRouter.chat(model, messages, byok);

    // Store assistant response
    userService.addMessage(userId, 'assistant', result.content);

    res.json({
      response: result.content,
      model: result.model,
      provider: result.provider,
      fallback: result.fallback,
    });
  } catch (err) {
    console.error('[Chat Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- User management ---
app.get('/api/user/:telegramId', (req, res) => {
  const user = userService.getOrCreate(req.params.telegramId);
  // Don't expose raw encrypted keys
  const safe = { ...user, byokKeys: Object.keys(user.byokKeys) };
  res.json(safe);
});

app.post('/api/user/:telegramId/settings', (req, res) => {
  const user = userService.updateSettings(req.params.telegramId, req.body);
  res.json({ success: true, settings: user.settings });
});

app.post('/api/user/:telegramId/byok', (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'provider and apiKey required' });
  }
  const result = userService.setByokKey(req.params.telegramId, provider, apiKey);
  res.json(result);
});

app.delete('/api/user/:telegramId/byok/:provider', (req, res) => {
  const result = userService.removeByokKey(req.params.telegramId, req.params.provider);
  res.json(result);
});

// --- Session ---
app.get('/api/session/:telegramId', (req, res) => {
  const session = userService.getSession(req.params.telegramId);
  res.json({ messages: session });
});

app.delete('/api/session/:telegramId', (req, res) => {
  const result = userService.clearSession(req.params.telegramId);
  res.json(result);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`\n🚀 TG-LLM Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Models: http://localhost:${PORT}/api/models\n`);
});
