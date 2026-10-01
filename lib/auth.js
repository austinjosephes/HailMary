/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * Admin Authentication & Session Management
 */

const crypto = require('crypto');

const DEFAULT_SECRET = 'ammayodoppam_clc_velappaya_secure_key_2024';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret() {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'clcvelappaya2024'
  };
}

/**
 * Creates a signed JWT-like session token: base64(payload).signature
 */
function createSessionToken(username) {
  const payload = {
    u: username,
    iat: Date.now(),
    exp: Date.now() + SESSION_EXPIRY_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a session token. Returns payload if valid, null otherwise.
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(payloadB64);
  const expectedSig = hmac.digest('base64url');

  try {
    const isSigValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!isSigValid) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Parse cookies from request headers
 */
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

/**
 * Extract and verify admin user from incoming request (supports Cookie or X-Admin-Token header)
 */
function authenticateAdmin(req) {
  const headers = req.headers || {};
  let token = headers['x-admin-token'] || headers['X-Admin-Token'];

  if (!token && headers.cookie) {
    const cookies = parseCookies(headers.cookie);
    token = cookies['admin_session'];
  }

  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Constant-time comparison for login credentials
 */
function checkCredentials(username, password) {
  const creds = getAdminCredentials();
  const uMatches = username === creds.username;
  const pMatches = password === creds.password;
  return uMatches && pMatches;
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  authenticateAdmin,
  checkCredentials,
  parseCookies
};
