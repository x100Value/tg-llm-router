const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '4000', 10);

function tokenCap(req, res, next) {
  const message = req.body?.message;
  if (message == null) return next();

  const length = String(message).length;
  if (length > MAX_INPUT_CHARS) {
    return res.status(400).json({
      error: `Message too long (${length}/${MAX_INPUT_CHARS} chars). Please shorten.`,
      code: 'INPUT_TOO_LARGE',
    });
  }

  next();
}

module.exports = tokenCap;
