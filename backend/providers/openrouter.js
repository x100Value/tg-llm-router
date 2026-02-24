// providers/openrouter.js — OpenRouter LLM Provider
const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

class OpenRouterProvider {
  constructor() {
    this.name = 'openrouter';
    this.baseUrl = OPENROUTER_BASE;
  }

  async chat(model, messages, apiKey) {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OpenRouter API key not configured');

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://t.me',
        'X-Title': 'TG-LLM-MVP',
      },
      body: JSON.stringify({
        model: model.replace('openrouter:', ''),
        messages,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      usage: data.usage,
      provider: this.name,
    };
  }

  async listModels(apiKey) {
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: key ? { 'Authorization': `Bearer ${key}` } : {},
      });
      const data = await res.json();
      return (data.data || [])
        .filter(m => m.id.includes(':free') || m.pricing?.prompt === '0')
        .slice(0, 15)
        .map(m => ({
          id: `openrouter:${m.id}`,
          name: m.name || m.id,
          provider: 'openrouter',
          context_length: m.context_length,
          status: 'available',
        }));
    } catch {
      return this.defaultModels();
    }
  }

  defaultModels() {
    return [
      { id: 'openrouter:meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', provider: 'openrouter', status: 'available' },
      { id: 'openrouter:google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)', provider: 'openrouter', status: 'available' },
      { id: 'openrouter:mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', provider: 'openrouter', status: 'available' },
    ];
  }
}

module.exports = new OpenRouterProvider();
