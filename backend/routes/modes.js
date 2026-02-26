const express = require('express');
const router = express.Router();

const MODES = {
  fast: { label: 'Fast', labelRu: 'Быстро', icon: '⚡', model: null, maxTokens: 256, desc: 'Cheapest & fastest model' },
  precise: { label: 'Precise', labelRu: 'Точно', icon: '🧠', model: null, maxTokens: 1024, desc: 'Best available model' },
  economy: { label: 'Economy', labelRu: 'Экономно', icon: '💰', model: null, maxTokens: 128, desc: 'Shortest answers, minimal cost' },
};

router.get('/api/modes', (req, res) => {
  const lang = req.query.lang || 'en';
  const isRu = lang.startsWith('ru');
  res.json({ modes: Object.entries(MODES).map(([id, m]) => ({ id, ...m, displayLabel: isRu ? m.labelRu : m.label })) });
});

module.exports = router;
module.exports.MODES = MODES;
