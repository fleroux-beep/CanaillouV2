/**
 * Simple in-memory rate limiter for login attempts.
 * Tracks attempts per IP with a sliding window.
 */

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Express middleware factory for rate limiting.
 * @param maxAttempts Maximum attempts within the window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(maxAttempts: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { attempts: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.attempts++;

    if (entry.attempts > maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Trop de tentatives. Réessayez plus tard.",
        retryAfter,
      });
    }

    next();
  };
}
