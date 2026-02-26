const { Pool } = require('pg');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class UserService {
  async init() {
    try {
      await pool.query('SELECT 1');
      console.log('[DB] PostgreSQL connected');
    } catch (e) {
      console.error('[DB] PostgreSQL failed, using memory fallback:', e.message);
      this.fallback = true;
      this.users = new Map();
      this.sessions = new Map();
    }
  }

  // --- Users ---
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

  // --- Billing / Limits ---
  async reserveRequest(telegramId) {
    if (this.fallback) return { type: 'fallback', field: null, remaining: null };

    await pool.query('INSERT INTO balances(telegram_id) VALUES($1) ON CONFLICT DO NOTHING', [telegramId]);

    let result = await pool.query(
      `UPDATE balances
       SET paid_credits = paid_credits - 1, updated_at = NOW()
       WHERE telegram_id=$1 AND paid_credits > 0
       RETURNING paid_credits, free_requests`,
      [telegramId]
    );

    if (result.rows[0]) {
      return {
        type: 'paid',
        field: 'paid_credits',
        remaining: parseInt(result.rows[0].paid_credits, 10),
      };
    }

    result = await pool.query(
      `UPDATE balances
       SET free_requests = free_requests - 1, updated_at = NOW()
       WHERE telegram_id=$1 AND paid_credits <= 0 AND free_requests > 0
       RETURNING paid_credits, free_requests`,
      [telegramId]
    );

    if (result.rows[0]) {
      return {
        type: 'free',
        field: 'free_requests',
        remaining: parseInt(result.rows[0].free_requests, 10),
      };
    }

    const err = new Error('Daily limit reached (20 free). Upgrade for unlimited.');
    err.code = 'LIMIT_REACHED';
    throw err;
  }

  async rollbackRequest(telegramId, reservation) {
    if (this.fallback || !reservation || !reservation.field) return;
    const field = reservation.field === 'paid_credits' ? 'paid_credits' : 'free_requests';
    await pool.query(`UPDATE balances SET ${field} = ${field} + 1, updated_at = NOW() WHERE telegram_id=$1`, [telegramId]);
  }

  async finalizeRequest(telegramId, reservation, meta = {}) {
    if (this.fallback || !reservation || !reservation.field) return;
    try {
      await pool.query(
        'INSERT INTO transactions(telegram_id, amount, type, meta) VALUES($1,$2,$3,$4)',
        [telegramId, 1, reservation.type, JSON.stringify(meta)]
      );
    } catch {
      // optional table/columns; do not fail user response if transaction log insert is unavailable
    }
  }

  // --- BYOK ---
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

  // --- Sessions ---
  async getSession(telegramId) {
    if (this.fallback) {
      if (!this.sessions.has(telegramId)) this.sessions.set(telegramId, []);
      return this.sessions.get(telegramId);
    }

    const { rows } = await pool.query(
      'SELECT role,content,created_at as timestamp FROM messages WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 50',
      [telegramId]
    );
    return rows.reverse();
  }

  async addMessage(telegramId, role, content, model, provider) {
    if (this.fallback) {
      const session = await this.getSession(telegramId);
      session.push({ role, content, timestamp: Date.now() });
      if (session.length > 50) session.splice(0, session.length - 50);
      return session;
    }

    await pool.query(
      'INSERT INTO messages(telegram_id,role,content,model,provider) VALUES($1,$2,$3,$4,$5)',
      [telegramId, role, content, model || null, provider || null]
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
