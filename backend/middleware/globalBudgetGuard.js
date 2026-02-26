const { Pool } = require('pg');
const alertService = require('../services/alertService');

const GLOBAL_DAILY_REQUEST_CAP = parseInt(process.env.GLOBAL_DAILY_REQUEST_CAP || '0', 10);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function globalBudgetGuard(req, res, next) {
  if (!Number.isFinite(GLOBAL_DAILY_REQUEST_CAP) || GLOBAL_DAILY_REQUEST_CAP <= 0) {
    return next();
  }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM transactions
       WHERE created_at >= date_trunc('day', NOW())`
    );

    const total = rows[0]?.total || 0;
    void alertService.notifyBudgetUsage(total, GLOBAL_DAILY_REQUEST_CAP);

    if (total >= GLOBAL_DAILY_REQUEST_CAP) {
      return res.status(429).json({
        error: 'Global daily request cap reached',
        code: 'GLOBAL_DAILY_CAP_REACHED',
      });
    }

    return next();
  } catch {
    void alertService.notifyGuardUnavailable('global-budget');
    return res.status(503).json({
      error: 'Budget guard temporarily unavailable',
      code: 'BUDGET_GUARD_UNAVAILABLE',
    });
  }
}

module.exports = globalBudgetGuard;
