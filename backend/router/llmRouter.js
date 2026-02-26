const openrouter = require('../providers/openrouter');
const huggingface = require('../providers/huggingface');
const alertService = require('../services/alertService');

const providers = { openrouter, huggingface };

class LLMRouter {
  constructor() {
    this.defaultModel = process.env.DEFAULT_MODEL || 'openrouter:qwen/qwen3-next-80b-a3b-instruct:free';
    this.fallbackModel = process.env.FALLBACK_MODEL || 'openrouter:nvidia/nemotron-nano-9b-v2:free';
    this.freeModels = [];
    this.lastRefresh = 0;
  }

  _parseModel(id) {
    const [provider, ...rest] = id.split(':');
    return { provider, model: rest.join(':') };
  }

  _getProvider(name) {
    const provider = providers[name];
    if (!provider) throw new Error(`Unknown provider: ${name}`);
    return provider;
  }

  async refreshFreeModels() {
    if (Date.now() - this.lastRefresh < 10 * 60 * 1000) return;

    try {
      const models = await openrouter.listModels();
      this.freeModels = models.filter((m) => m.status === 'available').map((m) => m.id);
      if (this.freeModels.length) {
        this.defaultModel = this.freeModels[0];
        this.fallbackModel = this.freeModels[1] || this.freeModels[0];
        console.log(`[Router] Refreshed ${this.freeModels.length} free models. Default: ${this.defaultModel}`);
      }
      this.lastRefresh = Date.now();
    } catch (err) {
      console.warn('[Router] Refresh failed:', err.message);
    }
  }

  async _tryHuggingFaceFallback(messages, byokKeys = {}) {
    try {
      const hfModels = await huggingface.listModels(byokKeys.huggingface);
      for (const model of hfModels.slice(0, 3)) {
        try {
          const result = await huggingface.chat(model.id, messages, byokKeys.huggingface || null);
          return { ...result, fallback: true };
        } catch {
          // try next HF model
        }
      }
    } catch {
      // ignore hf list failure
    }
    return null;
  }

  async chat(modelId, messages, byokKeys = {}) {
    await this.refreshFreeModels();

    const target = modelId || this.defaultModel;
    const { provider } = this._parseModel(target);

    try {
      const primary = this._getProvider(provider);
      const result = await primary.chat(target, messages, byokKeys[provider] || null);
      return { ...result, fallback: false };
    } catch (err) {
      console.warn(`[Router] Primary failed: ${err.message}`);
      void alertService.notifyProviderFailure('primary', provider, target, err.message);
    }

    const fallback = this.fallbackModel;
    if (target !== fallback) {
      try {
        const { provider: fp } = this._parseModel(fallback);
        const result = await this._getProvider(fp).chat(fallback, messages, byokKeys[fp] || null);
        return { ...result, fallback: true };
      } catch (err) {
        console.error(`[Router] Fallback failed: ${err.message}`);
        const { provider: fp } = this._parseModel(fallback);
        void alertService.notifyProviderFailure('fallback', fp, fallback, err.message);
      }
    }

    for (const model of this.freeModels) {
      if (model === target || model === fallback) continue;
      try {
        const { provider: p } = this._parseModel(model);
        const result = await this._getProvider(p).chat(model, messages, byokKeys[p] || null);
        return { ...result, fallback: true };
      } catch {
        // continue trying other models
      }
    }

    const hfResult = await this._tryHuggingFaceFallback(messages, byokKeys);
    if (hfResult) return hfResult;

    void alertService.notifyProviderFailure('all_failed', 'router', target, 'All LLM providers failed');
    throw new Error('All LLM providers failed.');
  }

  async *chatStream(modelId, messages, byokKeys = {}) {
    await this.refreshFreeModels();

    const target = modelId || this.defaultModel;
    const { provider } = this._parseModel(target);
    const p = this._getProvider(provider);

    try {
      if (!p.chatStream) {
        const result = await this.chat(modelId, messages, byokKeys);
        yield result.content;
        return;
      }

      yield* p.chatStream(target, messages, byokKeys[provider] || null);
    } catch (err) {
      void alertService.notifyProviderFailure('stream', provider, target, err.message);

      const fallback = await this.chat(modelId, messages, byokKeys);
      yield fallback.content;
    }
  }

  async listAllModels(byokKeys = {}) {
    await this.refreshFreeModels();

    const results = [];
    for (const [name, provider] of Object.entries(providers)) {
      try {
        const models = await provider.listModels(byokKeys[name]);
        results.push(...models);
      } catch {
        // ignore provider list failure
      }
    }

    return results;
  }
}

module.exports = new LLMRouter();
