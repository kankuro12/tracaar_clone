// Minimal in-memory fixed-window rate limiter. Single-process only (matches
// the rest of this app's in-memory state — session store, vehicle cache).
// Keyed by IP + route; swap for a shared store (redis) if you ever run more
// than one process.

function rateLimit({ windowMs, max, keyFn = (req) => req.ip }) {
  const hits = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'too many attempts, try again later' });
    }
    next();
  };
}

module.exports = { rateLimit };
