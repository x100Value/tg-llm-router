const openrouter = require('../providers/openrouter');
const huggingface = require('../providers/huggingface');
const providers = { openrouter, huggingface };

class LLMRouter {
  constructor() {
    this.defaultModel = process.env.DEFAULT_MODEL || 'openrouter:qwen/qwen3-next-80b-a3b-instruct:free';
    this.fallbackModel = process.env.FALLBACK_MODEL || 'openrouter:nvidia/nemotron-nano-9b-v2:free';
    this.freeModels = [];
    this.lastRefresh = 0;
  }

  _parseModel(id) { const [p,...r] = id.split(':'); return { provider: p, model: r.join(':') }; }
  _getProvider(n) { const p = providers[n]; if (!p) throw new Error(`Unknown provider: ${n}`); return p; }

  async refreshFreeModels() {
    if (Date.now() - this.lastRefresh < 10 * 60 * 1000) return; // cache 10 min
    try {
      const models = await openrouter.listModels();
      this.freeModels = models.filter(m => m.status === 'available').map(m => m.id);
      if (this.freeModels.length) {
        this.defaultModel = this.freeModels[0];
        this.fallbackModel = this.freeModels[1] || this.freeModels[0];
        console.log(`[Router] Refreshed ${this.freeModels.length} free models. Default: ${this.defaultModel}`);
      }
      this.lastRefresh = Date.now();
    } catch (e) { console.warn('[Router] Refresh failed:', e.message); }
  }

  async chat(modelId, messages, byokKeys = {}) {
    await this.refreshFreeModels();
    const target = modelId || this.defaultModel;
    const { provider } = this._parseModel(target);
    try {
      const p = this._getProvider(provider);
      const result = await p.chat(target, messages, byokKeys[provider] || null);
      return { ...result, fallback: false };
    } catch (err) {
      console.warn(`[Router] Primary failed: ${err.message}`);
    }
    // Try fallback
    const fb = this.fallbackModel;
    if (target !== fb) {
      try {
        const { provider: fp } = this._parseModel(fb);
        const result = await this._getProvider(fp).chat(fb, messages, byokKeys[fp] || null);
        return { ...result, fallback: true };
      } catch (e2) { console.error(`[Router] Fallback failed: ${e2.message}`); }
    }
    // Try any available free model
    for (const mid of this.freeModels) {
      if (mid === target || mid === fb) continue;
      try {
        const { provider: ap } = this._parseModel(mid);
        const result = await this._getProvider(ap).chat(mid, messages, byokKeys[ap] || null);
        return { ...result, fallback: true };
      } catch {}
    }
    throw new Error('All LLM providers failed.');
  }

  async *chatStream(modelId, messages, byokKeys = {}) {
    await this.refreshFreeModels();
    const target = modelId || this.defaultModel;
    const { provider } = this._parseModel(target);
    const p = this._getProvider(provider);
    if (!p.chatStream) { const r = await this.chat(modelId, messages, byokKeys); yield r.content; return; }
    yield* p.chatStream(target, messages, byokKeys[provider] || null);
  }

  async listAllModels(byokKeys = {}) {
    await this.refreshFreeModels();
    const results = [];
    for (const [name, provider] of Object.entries(providers)) {
      try { const models = await provider.listModels(byokKeys[name]); results.push(...models); } catch {}
    }
    return results;
  }
}
module.exports = new LLMRouter();
