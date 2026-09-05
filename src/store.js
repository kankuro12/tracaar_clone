// Shared key/value + counter store.
//
// Set REDIS_URL and this is backed by Redis, so state survives a process
// restart and is shared if you ever run more than one instance: login
// sessions, rate-limit counters, and the ingest hot-state (last device time
// and last position per IMEI, used for late-frame detection and geofence
// transitions) all stop being rebuilt from scratch on every deploy.
//
// Leave REDIS_URL unset and everything falls back to in-process Maps with the
// same interface, so local dev needs no Redis. If Redis is configured but
// unreachable at boot we log loudly and fall back rather than refusing to
// start — losing hot cache is not a reason to take the fleet offline.

const REDIS_URL = process.env.REDIS_URL || '';
const PREFIX = process.env.REDIS_PREFIX || 'tracaar:';

let client = null;
let ready = false;

// ---- in-memory fallback -----------------------------------------------
const mem = new Map();          // key -> { value, expiresAt|null }
const memHash = new Map();      // key -> Map<field, value>

function memGet(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expiresAt && e.expiresAt <= Date.now()) { mem.delete(key); return null; }
  return e.value;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of mem) if (e.expiresAt && e.expiresAt <= now) mem.delete(k);
}, 60_000).unref();

// ---- lifecycle ---------------------------------------------------------
async function connect({ log = console.log } = {}) {
  if (!REDIS_URL) {
    log('store: REDIS_URL not set — using in-memory state (does not survive restarts)');
    return null;
  }
  const { createClient } = require('redis');
  client = createClient({ url: REDIS_URL });
  // Without a handler an emitted 'error' would crash the process.
  client.on('error', (e) => {
    if (ready) { ready = false; log(`store: redis connection lost — ${e.message}`); }
  });
  client.on('ready', () => { ready = true; });
  try {
    await client.connect();
    ready = true;
    log(`store: redis connected (${REDIS_URL.replace(/\/\/.*@/, '//***@')})`);
  } catch (e) {
    ready = false;
    client = null;
    log(`store: redis unavailable (${e.message}) — falling back to in-memory state`);
  }
  return client;
}

const usingRedis = () => !!(client && ready);
const k = (key) => `${PREFIX}${key}`;

// ---- operations --------------------------------------------------------
// Every call falls back to memory if Redis is configured but currently down,
// so a Redis blip degrades behaviour instead of throwing into a request.

async function get(key) {
  if (usingRedis()) {
    try { return await client.get(k(key)); } catch { /* fall through */ }
  }
  return memGet(key);
}

async function set(key, value, ttlSeconds) {
  if (usingRedis()) {
    try {
      if (ttlSeconds) await client.set(k(key), String(value), { EX: ttlSeconds });
      else await client.set(k(key), String(value));
      return;
    } catch { /* fall through */ }
  }
  mem.set(key, { value: String(value), expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
}

async function del(key) {
  if (usingRedis()) {
    try { await client.del(k(key)); return; } catch { /* fall through */ }
  }
  mem.delete(key);
}

// Atomic counter with a fixed window, for rate limiting. Returns the count
// after this hit plus the ms remaining in the window.
async function incrWindow(key, windowMs) {
  if (usingRedis()) {
    try {
      const key2 = k(key);
      const count = await client.incr(key2);
      if (count === 1) await client.pExpire(key2, windowMs);
      let ttl = await client.pTTL(key2);
      if (ttl < 0) { await client.pExpire(key2, windowMs); ttl = windowMs; }
      return { count, resetInMs: ttl };
    } catch { /* fall through */ }
  }
  const now = Date.now();
  const e = mem.get(key);
  if (!e || !e.expiresAt || e.expiresAt <= now) {
    mem.set(key, { value: 1, expiresAt: now + windowMs });
    return { count: 1, resetInMs: windowMs };
  }
  e.value = Number(e.value) + 1;
  return { count: e.value, resetInMs: e.expiresAt - now };
}

// Hash helpers — used for per-IMEI ingest state, which is naturally one hash
// keyed by IMEI rather than thousands of top-level keys.
async function hGet(key, field) {
  if (usingRedis()) {
    try { return await client.hGet(k(key), String(field)); } catch { /* fall through */ }
  }
  const h = memHash.get(key);
  return h ? (h.get(String(field)) ?? null) : null;
}

async function hSet(key, field, value) {
  if (usingRedis()) {
    try { await client.hSet(k(key), String(field), String(value)); return; } catch { /* fall through */ }
  }
  let h = memHash.get(key);
  if (!h) memHash.set(key, (h = new Map()));
  h.set(String(field), String(value));
}

async function hDel(key, field) {
  if (usingRedis()) {
    try { await client.hDel(k(key), String(field)); return; } catch { /* fall through */ }
  }
  const h = memHash.get(key);
  if (h) h.delete(String(field));
}

// JSON convenience over the hash ops (ingest stores {lat,lon} per IMEI).
async function hGetJson(key, field) {
  const raw = await hGet(key, field);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const hSetJson = (key, field, value) => hSet(key, field, JSON.stringify(value));

async function quit() {
  if (client) { try { await client.quit(); } catch { /* closing anyway */ } }
  client = null;
  ready = false;
}

module.exports = {
  connect, quit, usingRedis,
  get, set, del, incrWindow,
  hGet, hSet, hDel, hGetJson, hSetJson,
  REDIS_URL,
};
