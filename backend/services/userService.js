// services/userService.js — In-memory user & session management
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!';

class UserService {
  constructor() {
    this.users = new Map();    // telegramId → user object
    this.sessions = new Map(); // telegramId → messages[]
  }

  // --- User CRUD ---
  getOrCreate(telegramId, lang = 'en') {
    if (!this.users.has(telegramId)) {
      this.users.set(telegramId, {
        telegramId,
        language: lang,
        byokKeys: {},
        settings: { defaultModel: null },
        createdAt: Date.now(),
      });
    }
    return this.users.get(telegramId);
  }

  getUser(telegramId) {
    return this.users.get(telegramId) || null;
  }

  updateSettings(telegramId, settings) {
    const user = this.getOrCreate(telegramId);
    Object.assign(user.settings, settings);
    return user;
  }

  // --- BYOK ---
  setByokKey(telegramId, provider, apiKey) {
    const user = this.getOrCreate(telegramId);
    user.byokKeys[provider] = CryptoJS.AES.encrypt(apiKey, ENCRYPTION_KEY).toString();
    return { success: true };
  }

  getByokKeys(telegramId) {
    const user = this.getUser(telegramId);
    if (!user) return {};
    const decrypted = {};
    for (const [prov, enc] of Object.entries(user.byokKeys)) {
      try {
        const bytes = CryptoJS.AES.decrypt(enc, ENCRYPTION_KEY);
        decrypted[prov] = bytes.toString(CryptoJS.enc.Utf8);
      } catch { /* skip corrupted */ }
    }
    return decrypted;
  }

  removeByokKey(telegramId, provider) {
    const user = this.getUser(telegramId);
    if (user) delete user.byokKeys[provider];
    return { success: true };
  }

  // --- Sessions ---
  getSession(telegramId) {
    if (!this.sessions.has(telegramId)) {
      this.sessions.set(telegramId, []);
    }
    return this.sessions.get(telegramId);
  }

  addMessage(telegramId, role, content) {
    const session = this.getSession(telegramId);
    session.push({ role, content, timestamp: Date.now() });
    // Keep last 50 messages
    if (session.length > 50) session.splice(0, session.length - 50);
    return session;
  }

  clearSession(telegramId) {
    this.sessions.set(telegramId, []);
    return { success: true };
  }

  // --- Stats ---
  stats() {
    return {
      totalUsers: this.users.size,
      activeSessions: this.sessions.size,
    };
  }
}

module.exports = new UserService();
