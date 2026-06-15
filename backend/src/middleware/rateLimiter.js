const { prepare } = require('../database');

/**
 * Simple in-memory rate limiter
 * Falls back to database-based tracking for persistence
 */

// In-memory store for high-speed rate limiting
const memoryStore = new Map();

// Clean up old entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of memoryStore.entries()) {
    const valid = entries.filter(e => now - e < 60000);
    if (valid.length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, valid);
    }
  }
}, 60000);

/**
 * Rate limiter middleware factory
 * @param {object} options
 * @param {number} options.windowMs - Time window in ms (default: 60000 = 1 min)
 * @param {number} options.max - Max requests per window (default: 10)
 * @param {string} options.message - Error message (default: 'คำขอมากเกินไป')
 * @param {boolean} options.logToDb - Whether to log to login_attempts table (default: false)
 */
function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 10;
  const message = options.message || 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง';
  const logToDb = options.logToDb || false;

  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!memoryStore.has(key)) {
      memoryStore.set(key, []);
    }

    const entries = memoryStore.get(key);
    const windowStart = now - windowMs;
    
    // Filter entries within current window
    const recentEntries = entries.filter(time => time > windowStart);
    memoryStore.set(key, recentEntries);

    if (recentEntries.length >= max) {
      // Log to database if needed (fire-and-forget, no await needed for rate limiter)
      if (logToDb && req.path) {
        try {
          // Fire and forget - we don't await because rate limiting must be fast
          prepare(
            'INSERT INTO login_attempts (ip_address, email, attempt_type, success) VALUES (?, ?, ?, 0)'
          ).run(key, req.body?.email || null, req.path.includes('login') ? 'login' : 'rate_limit');
        } catch (e) { /* ignore db errors */ }
      }

      return res.status(429).json({ 
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    recentEntries.push(now);
    memoryStore.set(key, recentEntries);
    next();
  };
}

/**
 * Strict rate limiter for auth endpoints
 * - 5 attempts per minute per IP
 * - Logs to database
 */
const authLimiter = rateLimiter({
  windowMs: 60000,
  max: 5,
  message: 'คำขอมากเกินไป กรุณารอ 1 นาทีแล้วลองใหม่',
  logToDb: true
});

/**
 * Standard rate limiter for API endpoints
 * - 60 requests per minute per IP
 */
const apiLimiter = rateLimiter({
  windowMs: 60000,
  max: 60,
  message: 'คำขอมากเกินไป กรุณารอแล้วลองใหม่'
});

/**
 * Strict rate limiter for admin sensitive actions
 * - 10 requests per minute per IP
 */
const adminActionLimiter = rateLimiter({
  windowMs: 60000,
  max: 10,
  message: 'ดำเนินการเร็วเกินไป กรุณารอสักครู่'
});

module.exports = { rateLimiter, authLimiter, apiLimiter, adminActionLimiter };
