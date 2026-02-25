const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure vault table
(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS vault (
    id SERIAL PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    category TEXT NOT NULL,
    encrypted_data TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(telegram_id, category)
  )`).catch(() => {});
})();

// Save encrypted blob
router.post('/api/vault/:telegramId/:category', async (req, res) => {
  try {
    const { telegramId, category } = req.params;
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'data required' });
    await pool.query(
      `INSERT INTO vault(telegram_id, category, encrypted_data, updated_at) VALUES($1,$2,$3,NOW())
       ON CONFLICT(telegram_id, category) DO UPDATE SET encrypted_data=$3, updated_at=NOW()`,
      [telegramId, category, data]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get encrypted blob
router.get('/api/vault/:telegramId/:category', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT encrypted_data FROM vault WHERE telegram_id=$1 AND category=$2', [req.params.telegramId, req.params.category]);
    res.json({ data: rows[0]?.encrypted_data || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List categories
router.get('/api/vault/:telegramId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT category, updated_at FROM vault WHERE telegram_id=$1', [req.params.telegramId]);
    res.json({ categories: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete category
router.delete('/api/vault/:telegramId/:category', async (req, res) => {
  try {
    await pool.query('DELETE FROM vault WHERE telegram_id=$1 AND category=$2', [req.params.telegramId, req.params.category]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
