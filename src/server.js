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

const app = express();
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
app.use(cookieParser());
// ponytail: MemoryStore is fine single-process; swap to a postgres store if we scale to multiple instances
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 },
}));
app.use('/api', routes);
app.use(web);
app.use(express.static(path.join(__dirname, '..', 'public')));
// leaflet served from node_modules so the dashboard needs no CDN
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
app.use('/vendor/bootstrap', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/jquery', express.static(path.join(__dirname, '..', 'node_modules', 'jquery', 'dist')));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const server = http.createServer(app);
const hub = new Hub();
hub.attach(server);

async function main() {
  await startIngest({ port: +process.env.INGEST_PORT || 9000, hub });
  startOfflineWatcher({ hub });
  startBilling({});
  server.listen(process.env.PORT || 3000, () => {
    console.log(`api: http://localhost:${process.env.PORT || 3000}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
