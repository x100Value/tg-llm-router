const { Pool } = require('pg');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!';
const MESSAGE_ENCRYPTION_ENABLED = (process.env.MESSAGE_ENCRYPTION_ENABLED || 'true').toLowerCase() !== 'false';
const MESSAGE_ENCRYPTION_PREFIX = process.env.MESSAGE_ENCRYPTION_PREFIX || 'enc:v1:';
const PER_USER_DAILY_REQUEST_CAP = parseInt(process.env.PER_USER_DAILY_REQUEST_CAP || '0', 10);
const FREE_DAILY_REQUEST_CAP = parseInt(process.env.FREE_DAILY_REQUEST_CAP || '20', 10);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class UserService {
  async init() {
    try {
      await pool.query('SELECT 1');
      await pool.query(`CREATE TABLE IF NOT EXISTS request_dedup (
        telegram_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        response JSONB,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY(telegram_id, request_id, endpoint)
      )`);
      console.log('[DB] PostgreSQL connected');
    } catch (e) {
      console.error('[DB] PostgreSQL failed, using memory fallback:', e.message);
      this.fallback = true;
      this.users = new Map();
      this.sessions = new Map();
    }
  }

  _encryptMessage(content) {
    const raw = String(content ?? '');
    if (!MESSAGE_ENCRYPTION_ENABLED) return raw;
    const encrypted = CryptoJS.AES.encrypt(raw, ENCRYPTION_KEY).toString();
    return `${MESSAGE_ENCRYPTION_PREFIX}${encrypted}`;
  }

  _decryptMessage(content) {
    const raw = String(content ?? '');
    if (!raw.startsWith(MESSAGE_ENCRYPTION_PREFIX)) return raw;

    const encrypted = raw.slice(MESSAGE_ENCRYPTION_PREFIX.length);
    try {
      const decrypted = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
      return decrypted || '[encrypted message unavailable]';
    } catch {
      return '[encrypted message unavailable]';
    }
  }

  _normalizeRequestId(requestId) {
    const value = String(requestId || '').trim();
    if (!value) return '';
    return value.slice(0, 128);
  }

  async beginIdempotentRequest(telegramId, requestId, endpoint) {
    const rid = this._normalizeRequestId(requestId);
    if (this.fallback || !rid) return { action: 'proceed' };

    const inserted = await pool.query(
      `INSERT INTO request_dedup(telegram_id, request_id, endpoint, status, updated_at)
       VALUES($1,$2,$3,'processing',NOW())
       ON CONFLICT DO NOTHING
       RETURNING status`,
      [telegramId, rid, endpoint]
    );

    if (inserted.rowCount > 0) return { action: 'proceed' };

    const existing = await pool.query(
      'SELECT status, response FROM request_dedup WHERE telegram_id=$1 AND request_id=$2 AND endpoint=$3',
      [telegramId, rid, endpoint]
    );

    const row = existing.rows[0];
    if (!row) return { action: 'proceed' };

    if (row.status === 'completed' && row.response) {
      return { action: 'replay', response: row.response };
    }

    if (row.status === 'processing') {
      return { action: 'in_progress' };
    }

    await pool.query(
      `UPDATE request_dedup
       SET status='processing', response=NULL, error=NULL, updated_at=NOW()
       WHERE telegram_id=$1 AND request_id=$2 AND endpoint=$3`,
      [telegramId, rid, endpoint]
    );

    return { action: 'proceed' };
  }

  async completeIdempotentRequest(telegramId, requestId, endpoint, responsePayload) {
    const rid = this._normalizeRequestId(requestId);
    if (this.fallback || !rid) return;

    await pool.query(
      `UPDATE request_dedup
       SET status='completed', response=$4::jsonb, error=NULL, updated_at=NOW()
       WHERE telegram_id=$1 AND request_id=$2 AND endpoint=$3`,
      [telegramId, rid, endpoint, JSON.stringify(responsePayload || {})]
    );
  }

  async failIdempotentRequest(telegramId, requestId, endpoint, errorText) {
    const rid = this._normalizeRequestId(requestId);
    if (this.fallback || !rid) return;

    await pool.query(
      `UPDATE request_dedup
       SET status='failed', error=$4, updated_at=NOW()
       WHERE telegram_id=$1 AND request_id=$2 AND endpoint=$3`,
      [telegramId, rid, endpoint, String(errorText || '').slice(0, 400)]
    );
  }

  async getOrCreate(telegramId, lang = 'en') {
    if (this.fallback) {
      if (!this.users.has(telegramId)) {
        this.users.set(telegramId, { telegramId, language: lang, byokKeys: {}, settings: {}, createdAt: Date.now() });
      }
      return this.users.get(telegramId);
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
    if (rows[0]) return rows[0];

    const created = await pool.query('INSERT INTO users(telegram_id,language) VALUES($1,$2) RETURNING *', [telegramId, lang]);
    return created.rows[0];
  }

  async getUser(telegramId) {
    if (this.fallback) return this.users.get(telegramId) || null;
    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
    return rows[0] || null;
  }

  async updateSettings(telegramId, settings) {
    if (this.fallback) {
      const user = await this.getOrCreate(telegramId);
      Object.assign(user.settings, settings);
      return user;
    }

    const user = await this.getOrCreate(telegramId);
    const merged = { ...user.settings, ...settings };
    await pool.query('UPDATE users SET settings=$1 WHERE telegram_id=$2', [JSON.stringify(merged), telegramId]);
    return { ...user, settings: merged };
  }

  _parsePositiveInt(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    if (value && typeof value === 'object') {
      if (value.dailyCap != null) return this._parsePositiveInt(value.dailyCap);
      if (value.limit != null) return this._parsePositiveInt(value.limit);
      if (value.value != null) return this._parsePositiveInt(value.value);
    }
    return null;
  }

  async getTodayUsageCount(telegramId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM transactions
       WHERE telegram_id=$1
         AND created_at >= date_trunc('day', NOW())`,
      [telegramId]
    );
    return rows[0]?.total || 0;
  }

  async getPlanDailyCap(telegramId) {
    const { rows } = await pool.query(
      `SELECT value
       FROM entitlements
       WHERE telegram_id=$1
         AND key='dailyCap'
         AND source='plan'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY expires_at DESC NULLS LAST
       LIMIT 1`,
      [telegramId]
    );

    if (!rows[0]) return null;
    return this._parsePositiveInt(rows[0].value);
  }

  async reserveRequest(telegramId) {
    if (this.fallback) return { type: 'fallback', field: null, remaining: null };

    const usedToday = await this.getTodayUsageCount(telegramId);

    if (Number.isFinite(PER_USER_DAILY_REQUEST_CAP) && PER_USER_DAILY_REQUEST_CAP > 0) {
      if (usedToday >= PER_USER_DAILY_REQUEST_CAP) {
        const err = new Error('Per-user daily request cap reached. Try again tomorrow.');
        err.code = 'USER_DAILY_CAP_REACHED';
        throw err;
      }
    }

    const planDailyCap = await this.getPlanDailyCap(telegramId);
    if (Number.isFinite(planDailyCap) && planDailyCap > 0) {
      if (usedToday >= planDailyCap) {
        const err = new Error(`Daily limit reached (${planDailyCap} on your plan). Upgrade for higher limits.`);
        err.code = 'LIMIT_REACHED';
        throw err;
      }

      return {
        type: 'plan',
        field: null,
        remaining: Math.max(planDailyCap - usedToday - 1, 0),
        dailyCap: planDailyCap,
      };
    }

    await pool.query('INSERT INTO balances(telegram_id) VALUES($1) ON CONFLICT DO NOTHING', [telegramId]);

    const paidCredits = await pool.query(
      `UPDATE balances
       SET paid_credits = paid_credits - 1, updated_at = NOW()
       WHERE telegram_id=$1 AND paid_credits > 0
       RETURNING paid_credits, free_requests`,
      [telegramId]
    );

    if (paidCredits.rows[0]) {
      return {
        type: 'paid_credit',
        field: 'paid_credits',
        remaining: parseInt(paidCredits.rows[0].paid_credits, 10),
      };
    }

    if (!Number.isFinite(FREE_DAILY_REQUEST_CAP) || FREE_DAILY_REQUEST_CAP <= 0) {
      return {
        type: 'free',
        field: null,
        remaining: null,
        dailyCap: null,
      };
    }

    if (usedToday >= FREE_DAILY_REQUEST_CAP) {
      const err = new Error(`Daily limit reached (${FREE_DAILY_REQUEST_CAP} free). Upgrade for unlimited.`);
      err.code = 'LIMIT_REACHED';
      throw err;
    }

    return {
      type: 'free',
      field: null,
      remaining: Math.max(FREE_DAILY_REQUEST_CAP - usedToday - 1, 0),
      dailyCap: FREE_DAILY_REQUEST_CAP,
    };
  }

  async rollbackRequest(telegramId, reservation) {
    if (this.fallback || !reservation || !reservation.field) return;
    const field = reservation.field === 'paid_credits' ? 'paid_credits' : 'free_requests';
    await pool.query(`UPDATE balances SET ${field} = ${field} + 1, updated_at = NOW() WHERE telegram_id=$1`, [telegramId]);
  }

  async finalizeRequest(telegramId, reservation, meta = {}) {
    if (this.fallback || !reservation) return;

    const typeBase = String(reservation.type || 'request').trim() || 'request';
    const endpoint = String(meta?.endpoint || '').trim();
    const type = endpoint ? `${typeBase}:${endpoint}`.slice(0, 120) : typeBase.slice(0, 120);
    const model = meta?.model ? String(meta.model).slice(0, 255) : null;

    try {
      await pool.query(
        'INSERT INTO transactions(telegram_id, amount, type, model) VALUES($1,$2,$3,$4)',
        [telegramId, 1, type, model]
      );
    } catch {
      // optional table/columns; do not fail user response if transaction log insert is unavailable
    }
  }

  async setByokKey(telegramId, provider, apiKey) {
    const encrypted = CryptoJS.AES.encrypt(apiKey, ENCRYPTION_KEY).toString();
    if (this.fallback) {
      const user = await this.getOrCreate(telegramId);
      user.byokKeys[provider] = encrypted;
      return { success: true };
    }

    const user = await this.getOrCreate(telegramId);
    const keys = { ...(user.byok_keys || {}), [provider]: encrypted };
    await pool.query('UPDATE users SET byok_keys=$1 WHERE telegram_id=$2', [JSON.stringify(keys), telegramId]);
    return { success: true };
  }

  async getByokKeys(telegramId) {
    const user = await this.getUser(telegramId);
    if (!user) return {};

    const raw = this.fallback ? user.byokKeys : (user.byok_keys || {});
    const decrypted = {};
    for (const [provider, encrypted] of Object.entries(raw)) {
      try {
        decrypted[provider] = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
      } catch {
        // skip broken key rows
      }
    }
    return decrypted;
  }

  async removeByokKey(telegramId, provider) {
    if (this.fallback) {
      const user = await this.getUser(telegramId);
      if (user) delete user.byokKeys[provider];
      return { success: true };
    }

    const user = await this.getUser(telegramId);
    if (!user) return { success: true };

    const keys = { ...(user.byok_keys || {}) };
    delete keys[provider];
    await pool.query('UPDATE users SET byok_keys=$1 WHERE telegram_id=$2', [JSON.stringify(keys), telegramId]);
    return { success: true };
  }

  async getSession(telegramId) {
    if (this.fallback) {
      if (!this.sessions.has(telegramId)) this.sessions.set(telegramId, []);
      return this.sessions.get(telegramId);
    }

    const { rows } = await pool.query(
      'SELECT role,content,created_at as timestamp FROM messages WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 50',
      [telegramId]
    );

    return rows.reverse().map((row) => ({
      ...row,
      content: this._decryptMessage(row.content),
    }));
  }

  async addMessage(telegramId, role, content, model, provider) {
    if (this.fallback) {
      const session = await this.getSession(telegramId);
      session.push({ role, content, timestamp: Date.now() });
      if (session.length > 50) session.splice(0, session.length - 50);
      return session;
    }

    const storedContent = this._encryptMessage(content);

    await pool.query(
      'INSERT INTO messages(telegram_id,role,content,model,provider) VALUES($1,$2,$3,$4,$5)',
      [telegramId, role, storedContent, model || null, provider || null]
    );
  }

  async clearSession(telegramId) {
    if (this.fallback) {
      this.sessions.set(telegramId, []);
      return { success: true };
    }

    await pool.query('DELETE FROM messages WHERE telegram_id=$1', [telegramId]);
    return { success: true };
  }

  async stats() {
    if (this.fallback) {
      return { totalUsers: this.users.size, activeSessions: this.sessions.size, db: 'memory' };
    }

    const users = await pool.query('SELECT COUNT(*) FROM users');
    const sessions = await pool.query('SELECT COUNT(DISTINCT telegram_id) FROM messages');

    return {
      totalUsers: parseInt(users.rows[0].count, 10),
      activeSessions: parseInt(sessions.rows[0].count, 10),
      db: 'postgresql',
    };
  }
}

module.exports = new UserService();
