const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || '4000');

function tokenCap(req, res, next) {
  const msg = req.body?.message;
  if (msg && msg.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Message too long (${msg.length}/${MAX_INPUT_CHARS} chars). Please shorten.` });
  }
  next();
}
module.exports = tokenCap;
