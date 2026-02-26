const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Track visit
router.post('/api/stats/visit', async (req, res) => {
  try {
    const { telegramId } = req.body;
    await pool.query(`CREATE TABLE IF NOT EXISTS visits (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query('INSERT INTO visits(telegram_id) VALUES($1)', [telegramId || 'anon']);
    const { rows: total } = await pool.query('SELECT COUNT(*) as c FROM visits');
    const { rows: unique } = await pool.query('SELECT COUNT(DISTINCT telegram_id) as c FROM visits');
    res.json({ total: parseInt(total[0].c), unique: parseInt(unique[0].c) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get stats
router.get('/api/stats', async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS visits (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const { rows: total } = await pool.query('SELECT COUNT(*) as c FROM visits');
    const { rows: unique } = await pool.query('SELECT COUNT(DISTINCT telegram_id) as c FROM visits');
    res.json({ total: parseInt(total[0].c), unique: parseInt(unique[0].c) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
