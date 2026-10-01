/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * In-memory sliding window rate limiter for public submissions.
 */

const ipRequests = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 40; // Max 40 submissions per minute per IP

/**
 * Clean up old entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequests.entries()) {
    if (now - data.startTime > WINDOW_MS) {
      ipRequests.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function getClientIp(req) {
  const headers = req.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();

  let entry = ipRequests.get(ip);
  if (!entry || now - entry.startTime > WINDOW_MS) {
    entry = { count: 1, startTime: now };
    ipRequests.set(ip, entry);
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.startTime + WINDOW_MS - now) / 1000) };
  }

  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count };
}

module.exports = {
  getClientIp,
  checkRateLimit
};
