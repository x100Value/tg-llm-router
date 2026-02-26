const PROMPT_SHIELD_ENABLED = (process.env.PROMPT_SHIELD_ENABLED || 'true').toLowerCase() !== 'false';

const BLOCK_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?(the\s+)?(above|previous)\s+instructions?/i,
  /show\s+(me\s+)?(the\s+)?(system|developer|hidden)\s+prompt/i,
  /reveal\s+(the\s+)?(system|developer|hidden)\s+prompt/i,
  /(print|dump)\s+.*(system|developer)\s+prompt/i,
  /(bypass|disable)\s+(safety|guardrails?|policy|policies)/i,
];

function promptShield(req, res, next) {
  if (!PROMPT_SHIELD_ENABLED) return next();

  const message = String(req.body?.message || '');
  if (!message) return next();

  const matched = BLOCK_PATTERNS.find((pattern) => pattern.test(message));
  if (matched) {
    return res.status(400).json({
      error: 'Prompt blocked by security policy',
      code: 'PROMPT_INJECTION_BLOCKED',
    });
  }

  next();
}

module.exports = promptShield;
