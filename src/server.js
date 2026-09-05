require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const web = require('./web');
const Hub = require('./hub');
const { startIngest } = require('./ingest');
const { startOfflineWatcher } = require('./offline');
const { startBilling } = require('./billing');
const { startRetention } = require('./retention');
const { startMaintenanceWatcher } = require('./maintenance');
const store = require('./store');

const app = express();
// Behind nginx/Caddy, req.ip is the proxy's address unless we trust it — which
// would give every user one shared rate-limit budget and let one bad actor lock
// everyone out. Set TRUST_PROXY to the number of proxies in front of this app
// (usually 1), or a comma list of trusted addresses.
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(tp) ? +tp : tp);
}
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// CORS — ERP/3rd-party servers call the API cross-origin (tokens in headers, no cookies)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required (set it in .env — do not run with a default secret)');
}
app.use(cookieParser());

// Health check is mounted before the session layer so it stays answerable even
// if the session backend is unhappy.
app.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), store: store.usingRedis() ? 'redis' : 'memory' });
});

// Sessions land in Redis when REDIS_URL is set, so a deploy no longer signs
// every dashboard user out. Falls back to the in-process store otherwise.
function mountSession(redisClient) {
  const opts = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    },
  };
  if (redisClient) {
    const { RedisStore } = require('connect-redis');
    opts.store = new RedisStore({ client: redisClient, prefix: (process.env.REDIS_PREFIX || 'tracaar:') + 'sess:' });
  }
  app.use(session(opts));
  app.use('/api', routes);
  app.use(web);
  app.use(express.static(path.join(__dirname, '..', 'public')));
  // leaflet served from node_modules so the map needs no CDN (bootstrap/jquery come from CDN)
  app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });
}

const server = http.createServer(app);
const hub = new Hub();
hub.attach(server);

async function main() {
  const redisClient = await store.connect();
  mountSession(redisClient);

  await startIngest({ port: +process.env.INGEST_PORT || 9000, host: '0.0.0.0', hub });
  startOfflineWatcher({ hub });
  startBilling({});
  startRetention({});
  startMaintenanceWatcher({ hub });
  server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`api: http://localhost:${process.env.PORT || 3000}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  server.close(() => {});
  await store.quit();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((e) => { console.error(e); process.exit(1); });
