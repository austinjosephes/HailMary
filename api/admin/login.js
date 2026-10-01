/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * API: /api/admin/login
 */

const { checkCredentials, createSessionToken } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const isValid = checkCredentials(username, password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = createSessionToken(username);

  // Set secure HttpOnly cookie
  const isProd = process.env.NODE_ENV === 'production';
  const cookieFlags = [
    `admin_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${24 * 60 * 60}`
  ];
  if (isProd) {
    cookieFlags.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieFlags.join('; '));

  return res.status(200).json({
    success: true,
    token,
    username
  });
};
