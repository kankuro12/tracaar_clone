// Fixed-window rate limiter backed by the shared store: Redis when REDIS_URL
// is set (so the window survives a restart and is shared across instances —
// restarting no longer hands an attacker a fresh budget), in-process Maps
// otherwise.

const store = require('./store');

function rateLimit({ windowMs, max, keyFn = (req) => req.ip }) {
  return (req, res, next) => {
    const key = `rl:${keyFn(req)}`;
    store.incrWindow(key, windowMs).then(({ count, resetInMs }) => {
      if (count > max) {
        res.set('Retry-After', Math.ceil(resetInMs / 1000));
        return res.status(429).json({ error: 'too many attempts, try again later' });
      }
      next();
    }).catch(() => next()); // never let the limiter itself break a login
  };
}

module.exports = { rateLimit };
