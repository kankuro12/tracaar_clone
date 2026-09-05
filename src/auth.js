const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function sign(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, cid: user.customer_id ?? null },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Short-lived session token for ERP/3rd-party WS clients. Carries the exact
// vehicle ids the client may receive, valid ttl seconds (capped by the route).
function signSessionToken({ customerId, vehicleIds, ttlSeconds }) {
  return jwt.sign(
    { kind: 'integration', cid: customerId, vids: vehicleIds },
    process.env.JWT_SECRET,
    { expiresIn: ttlSeconds }
  );
}

function verify(token) {
  const p = jwt.verify(token, process.env.JWT_SECRET);
  return { id: p.uid, role: p.role, customerId: p.cid, kind: p.kind, vehicleIds: p.vids };
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomKey = (prefix = 'fk_') => `${prefix}${crypto.randomBytes(24).toString('hex')}`;

const MIN_PASSWORD_LEN = 6;
const weakPassword = (pw) => !pw || String(pw).length < MIN_PASSWORD_LEN;

// Express middleware; sets req.user. Accepts Bearer JWT (API clients) or the
// dashboard session cookie (req.session.user, set by src/web.js login).
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try { req.user = verify(h.slice(7)); return next(); }
    catch { return res.status(401).json({ error: 'invalid token' }); }
  }
  if (req.session && req.session.user) { req.user = req.session.user; return next(); }
  res.status(401).json({ error: 'missing token' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

module.exports = { sign, signSessionToken, verify, sha256, randomKey, auth, requireRole, weakPassword, MIN_PASSWORD_LEN };
