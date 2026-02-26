const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MAX_VAULT_BLOB_CHARS = parseInt(process.env.MAX_VAULT_BLOB_CHARS || '800000', 10);
const CATEGORY_RE = /^[a-z0-9_-]{1,64}$/i;
const TELEGRAM_ID_RE = /^\d{4,20}$/;

function isValidTelegramId(value) {
  return TELEGRAM_ID_RE.test(String(value || ''));
}

function isValidCategory(value) {
  return CATEGORY_RE.test(String(value || ''));
}

function validateBaseParams(req, res) {
  const { telegramId } = req.params;
  if (!isValidTelegramId(telegramId)) {
    res.status(400).json({ error: 'Invalid telegramId' });
    return false;
  }
  return true;
}

function validateCategoryParams(req, res) {
  if (!validateBaseParams(req, res)) return false;
  const { category } = req.params;
  if (!isValidCategory(category)) {
    res.status(400).json({ error: 'Invalid category' });
    return false;
  }
  return true;
}

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

router.post('/:telegramId/:category', async (req, res) => {
  try {
    if (!validateCategoryParams(req, res)) return;

    const { telegramId, category } = req.params;
    const data = String(req.body?.data || '');

    if (!data) return res.status(400).json({ error: 'data required' });
    if (data.length > MAX_VAULT_BLOB_CHARS) {
      return res.status(413).json({ error: 'vault blob too large' });
    }

    await pool.query(
      `INSERT INTO vault(telegram_id, category, encrypted_data, updated_at) VALUES($1,$2,$3,NOW())
       ON CONFLICT(telegram_id, category) DO UPDATE SET encrypted_data=$3, updated_at=NOW()`,
      [telegramId, category, data]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:telegramId/:category', async (req, res) => {
  try {
    if (!validateCategoryParams(req, res)) return;
    const { telegramId, category } = req.params;

    const { rows } = await pool.query(
      'SELECT encrypted_data FROM vault WHERE telegram_id=$1 AND category=$2',
      [telegramId, category]
    );

    res.json({ data: rows[0]?.encrypted_data || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:telegramId', async (req, res) => {
  try {
    if (!validateBaseParams(req, res)) return;
    const { telegramId } = req.params;

    const { rows } = await pool.query(
      'SELECT category, updated_at FROM vault WHERE telegram_id=$1 ORDER BY updated_at DESC',
      [telegramId]
    );

    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:telegramId/:category', async (req, res) => {
  try {
    if (!validateCategoryParams(req, res)) return;
    const { telegramId, category } = req.params;

    await pool.query('DELETE FROM vault WHERE telegram_id=$1 AND category=$2', [telegramId, category]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
