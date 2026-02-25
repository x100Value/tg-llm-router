const { Pool } = require('pg');
const CryptoJS = require('crypto-js');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class UserService {
  async init() {
    try { await pool.query('SELECT 1'); console.log('[DB] PostgreSQL connected'); }
    catch(e) { console.error('[DB] PostgreSQL failed, using memory fallback:', e.message); this.fallback = true; this.users = new Map(); this.sessions = new Map(); }
  }

  // --- Users ---
  async getOrCreate(telegramId, lang = 'en') {
    if (this.fallback) {
      if (!this.users.has(telegramId)) this.users.set(telegramId, { telegramId, language: lang, byokKeys: {}, settings: {}, createdAt: Date.now() });
      return this.users.get(telegramId);
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
    if (rows[0]) return rows[0];
    const r = await pool.query('INSERT INTO users(telegram_id,language) VALUES($1,$2) RETURNING *', [telegramId, lang]);
    return r.rows[0];
  }

  async getUser(telegramId) {
    if (this.fallback) return this.users.get(telegramId) || null;
    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
    return rows[0] || null;
  }

  async updateSettings(telegramId, settings) {
    if (this.fallback) { const u = await this.getOrCreate(telegramId); Object.assign(u.settings, settings); return u; }
    const user = await this.getOrCreate(telegramId);
    const merged = { ...user.settings, ...settings };
    await pool.query('UPDATE users SET settings=$1 WHERE telegram_id=$2', [JSON.stringify(merged), telegramId]);
    return { ...user, settings: merged };
  }

  // --- BYOK ---
  async setByokKey(telegramId, provider, apiKey) {
    const encrypted = CryptoJS.AES.encrypt(apiKey, ENCRYPTION_KEY).toString();
    if (this.fallback) { const u = await this.getOrCreate(telegramId); u.byokKeys[provider] = encrypted; return { success: true }; }
    const user = await this.getOrCreate(telegramId);
    const keys = { ...(user.byok_keys || {}), [provider]: encrypted };
    await pool.query('UPDATE users SET byok_keys=$1 WHERE telegram_id=$2', [JSON.stringify(keys), telegramId]);
    return { success: true };
  }

  async getByokKeys(telegramId) {
    const user = await this.getUser(telegramId);
    if (!user) return {};
    const raw = this.fallback ? user.byokKeys : (user.byok_keys || {});
    const dec = {};
    for (const [p, enc] of Object.entries(raw)) {
      try { dec[p] = CryptoJS.AES.decrypt(enc, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8); } catch {}
    }
    return dec;
  }

  async removeByokKey(telegramId, provider) {
    if (this.fallback) { const u = await this.getUser(telegramId); if (u) delete u.byokKeys[provider]; return { success: true }; }
    const user = await this.getUser(telegramId);
    if (!user) return { success: true };
    const keys = { ...(user.byok_keys || {}) }; delete keys[provider];
    await pool.query('UPDATE users SET byok_keys=$1 WHERE telegram_id=$2', [JSON.stringify(keys), telegramId]);
    return { success: true };
  }

  // --- Sessions ---
  async getSession(telegramId) {
    if (this.fallback) { if (!this.sessions.has(telegramId)) this.sessions.set(telegramId, []); return this.sessions.get(telegramId); }
    const { rows } = await pool.query('SELECT role,content,created_at as timestamp FROM messages WHERE telegram_id=$1 ORDER BY created_at DESC LIMIT 50', [telegramId]);
    return rows.reverse();
  }

  async addMessage(telegramId, role, content, model, provider) {
    if (this.fallback) { const s = await this.getSession(telegramId); s.push({ role, content, timestamp: Date.now() }); if (s.length > 50) s.splice(0, s.length-50); return s; }
    await pool.query('INSERT INTO messages(telegram_id,role,content,model,provider) VALUES($1,$2,$3,$4,$5)', [telegramId, role, content, model||null, provider||null]);
  }

  async clearSession(telegramId) {
    if (this.fallback) { this.sessions.set(telegramId, []); return { success: true }; }
    await pool.query('DELETE FROM messages WHERE telegram_id=$1', [telegramId]);
    return { success: true };
  }

  async stats() {
    if (this.fallback) return { totalUsers: this.users.size, activeSessions: this.sessions.size, db: 'memory' };
    const u = await pool.query('SELECT COUNT(*) FROM users');
    const m = await pool.query('SELECT COUNT(DISTINCT telegram_id) FROM messages');
    return { totalUsers: parseInt(u.rows[0].count), activeSessions: parseInt(m.rows[0].count), db: 'postgresql' };
  }
}
module.exports = new UserService();
