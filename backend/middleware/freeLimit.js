const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function freeLimit(req, res, next) {
  const userId = req.body?.userId;
  if (!userId) return next();
  try {
    // Ensure balance row
    await pool.query(`INSERT INTO balances(telegram_id) VALUES($1) ON CONFLICT DO NOTHING`, [userId]);
    const { rows } = await pool.query('SELECT free_requests, paid_credits FROM balances WHERE telegram_id=$1', [userId]);
    const bal = rows[0];
    if (bal.paid_credits > 0) { return next(); } // paid user — no limit
    if (bal.free_requests <= 0) {
      return res.status(402).json({ error: 'Daily limit reached (20 free). Upgrade for unlimited.', limit: true, remaining: 0 });
    }
    await pool.query('UPDATE balances SET free_requests = free_requests - 1, updated_at = NOW() WHERE telegram_id=$1', [userId]);
    res.setHeader('X-Remaining', bal.free_requests - 1);
    next();
  } catch (e) { next(); } // fail open
}

module.exports = freeLimit;
