/**
 * CORS middleware — allows the Next.js frontend to call the API with cookies.
 */
const config = require('../../config/env');

function cors(req, res, next) {
  const origin = config.frontendUrl;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

module.exports = cors;
