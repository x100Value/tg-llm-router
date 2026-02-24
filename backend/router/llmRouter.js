// router/llmRouter.js — Model selection + fallback
const openrouter = require('../providers/openrouter');
const huggingface = require('../providers/huggingface');

const providers = { openrouter, huggingface };

class LLMRouter {
  constructor() {
    this.defaultModel = process.env.DEFAULT_MODEL || 'openrouter:meta-llama/llama-3.1-8b-instruct:free';
    this.fallbackModel = process.env.FALLBACK_MODEL || 'huggingface:meta-llama/Meta-Llama-3-8B-Instruct';
  }

  _parseModel(modelId) {
    const [provider, ...rest] = modelId.split(':');
    return { provider, model: rest.join(':') };
  }

  _getProvider(name) {
    const p = providers[name];
    if (!p) throw new Error(`Unknown provider: ${name}`);
    return p;
  }

  async chat(modelId, messages, byokKeys = {}) {
    const target = modelId || this.defaultModel;
    const { provider, model } = this._parseModel(target);

    // Try primary
    try {
      const p = this._getProvider(provider);
      const apiKey = byokKeys[provider] || null;
      console.log(`[Router] → ${provider}/${model}`);
      const result = await p.chat(target, messages, apiKey);
      return { ...result, fallback: false };
    } catch (err) {
      console.warn(`[Router] Primary failed (${provider}): ${err.message}`);
    }

    // Try fallback
    if (target !== this.fallbackModel) {
      try {
        const { provider: fbProv } = this._parseModel(this.fallbackModel);
        const p = this._getProvider(fbProv);
        const apiKey = byokKeys[fbProv] || null;
        console.log(`[Router] → fallback ${this.fallbackModel}`);
        const result = await p.chat(this.fallbackModel, messages, apiKey);
        return { ...result, fallback: true };
      } catch (err2) {
        console.error(`[Router] Fallback failed: ${err2.message}`);
      }
    }

    throw new Error('All LLM providers failed. Check API keys or try later.');
  }

  async listAllModels(byokKeys = {}) {
    const results = [];
    for (const [name, provider] of Object.entries(providers)) {
      try {
        const models = await provider.listModels(byokKeys[name]);
        results.push(...models);
      } catch (err) {
        console.warn(`[Router] Failed to list ${name} models: ${err.message}`);
      }
    }
    return results;
  }
}

module.exports = new LLMRouter();
