const express = require('express');
const router = express.Router();

const PERSONAS = [
  { id: 'coder', icon: '👨‍💻', name: 'Coder', nameRu: 'Кодер', prompt: 'You are an expert programmer. Write clean, efficient code. Explain your reasoning. Use best practices.' },
  { id: 'translator', icon: '🌐', name: 'Translator', nameRu: 'Переводчик', prompt: 'You are a professional translator. Translate accurately while preserving tone, idioms, and cultural context. If the user writes in one language, translate to the other (Russian↔English by default).' },
  { id: 'analyst', icon: '📊', name: 'Analyst', nameRu: 'Аналитик', prompt: 'You are a senior data analyst. Break down problems with data-driven insights. Use structured reasoning, provide metrics and actionable conclusions.' },
  { id: 'writer', icon: '✍️', name: 'Writer', nameRu: 'Писатель', prompt: 'You are a creative writer and copywriter. Write engaging, clear, well-structured content. Adapt tone to the request — formal, casual, marketing, storytelling.' },
];

router.get('/api/personas', (req, res) => {
  const lang = req.query.lang || 'en';
  res.json({ personas: PERSONAS.map(p => ({ ...p, displayName: lang.startsWith('ru') ? p.nameRu : p.name })) });
});

module.exports = router;
module.exports.PERSONAS = PERSONAS;
