const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const validateTelegram = require('../middleware/validateTelegram');
const requireTelegramUserMatch = require('../middleware/requireTelegramUserMatch');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.post('/api/user/:telegramId/ton-link', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    await pool.query('UPDATE users SET ton_address=$1 WHERE telegram_id=$2', [address, req.params.telegramId]);
    res.json({ success: true, address });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/user/:telegramId/ton-wallet', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT ton_address FROM users WHERE telegram_id=$1', [req.params.telegramId]);
    res.json({ address: rows[0]?.ton_address || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/user/:telegramId/ton-wallet', validateTelegram, requireTelegramUserMatch, async (req, res) => {
  try {
    await pool.query('UPDATE users SET ton_address=NULL WHERE telegram_id=$1', [req.params.telegramId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
