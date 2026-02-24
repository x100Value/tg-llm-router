// providers/huggingface.js — HuggingFace Inference Provider
const HF_BASE = process.env.HF_BASE_URL || 'https://api-inference.huggingface.co/models';

class HuggingFaceProvider {
  constructor() {
    this.name = 'huggingface';
    this.baseUrl = HF_BASE;
  }

  async chat(model, messages, apiKey) {
    const key = apiKey || process.env.HF_API_KEY;
    if (!key) throw new Error('HuggingFace API key not configured');

    const modelId = model.replace('huggingface:', '');
    const prompt = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant:';

    const res = await fetch(`${this.baseUrl}/${modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 512, return_full_text: false },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HuggingFace ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || '';

    return {
      content: content.trim(),
      model: modelId,
      usage: null,
      provider: this.name,
    };
  }

  async listModels() {
    return [
      { id: 'huggingface:meta-llama/Meta-Llama-3-8B-Instruct', name: 'Llama 3 8B (HF)', provider: 'huggingface', status: 'available' },
      { id: 'huggingface:mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B v0.3 (HF)', provider: 'huggingface', status: 'available' },
      { id: 'huggingface:google/gemma-2b-it', name: 'Gemma 2B (HF)', provider: 'huggingface', status: 'available' },
    ];
  }
}

module.exports = new HuggingFaceProvider();
