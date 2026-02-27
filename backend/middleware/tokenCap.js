const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '4000', 10);
const MAX_CONTEXT_CHARS = parseInt(process.env.MAX_CONTEXT_CHARS || '24000', 10);
const MAX_OUTPUT_TOKENS = parseInt(process.env.MAX_OUTPUT_TOKENS || '1024', 10);

function tokenCap(req, res, next) {
  const message = req.body?.message;
  if (message == null) return next();

  const length = String(message).length;
  if (length > MAX_INPUT_CHARS) {
    return res.status(400).json({
      error: 'Message too long (' + length + '/' + MAX_INPUT_CHARS + ' chars). Please shorten.',
      code: 'INPUT_TOO_LARGE',
    });
  }

  if (!req.body.max_tokens || req.body.max_tokens > MAX_OUTPUT_TOKENS) {
    req.body.max_tokens = MAX_OUTPUT_TOKENS;
  }

  next();
}

function trimContextToLimit(messages, maxChars = MAX_CONTEXT_CHARS) {
  let total = 0;
  const trimmed = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const len = (messages[i].content || '').length;
    if (total + len > maxChars) break;
    total += len;
    trimmed.unshift(messages[i]);
  }

  return trimmed;
}

module.exports = tokenCap;
module.exports.trimContextToLimit = trimContextToLimit;
module.exports.MAX_OUTPUT_TOKENS = MAX_OUTPUT_TOKENS;
