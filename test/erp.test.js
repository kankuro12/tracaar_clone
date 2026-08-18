/* ERP integration flow test — emulated inside a real browser page
   (fetch + WebSocket), with real H02 device frames pushed to the ingest port.
   Run: npm start, then: node --test test/erp.test.js */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const INGEST_PORT = 9000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

before(async () => {
  browser = await chromium.launch({ headless: false });
  page = await browser.newPage();
  await page.goto(`${BASE}/login`);
});

after(async () => { await browser.close(); });

const erp = (body) =>
  page.evaluate(async ({ BASE, body }) => {
    const j = (r) => r.status === 204 ? null : r.json().catch(() => null);
    const r = await fetch(`${BASE}${body.path}`, {
      method: body.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(body.headers || {}) },
      body: body.body ? JSON.stringify(body.body) : undefined,
    });
    return { status: r.status, data: await j(r) };
  }, { BASE, body });

function h02Frame(imei, lat, lon, speedKn) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const date = `${pad(now.getUTCDate())}${pad(now.getUTCMonth() + 1)}${String(now.getUTCFullYear()).slice(2)}`;
  const nmea = (coord, lat) => {
    const h = coord < 0 ? (lat ? 'S' : 'W') : (lat ? 'N' : 'E');
    const a = Math.abs(coord);
    const deg = Math.floor(a);
    const min = (a - deg) * 60;
    return [((deg * 100 + min).toFixed(4)).padStart(lat ? 7 : 8, '0'), h];
  };
  const [ln, lh] = nmea(lat, true);
  const [lo, oh] = nmea(lon, false);
  return `*HQ,${imei},V1,${time},A,${ln},${lh},${lo},${oh},${speedKn.toFixed(2)},090,${date},FBF7BBFF,222,10,11032,27783#`;
}

const pushFrames = (frames) => new Promise((resolve, reject) => {
  const s = net.connect(INGEST_PORT, 'localhost', () => {
    s.write(frames.join(''));
    s.end();
    resolve();
  });
  s.on('error', reject);
});

test('admin key needs name + clientId; ERP self-registers via admin creds', async () => {
  const login = await erp({ path: '/api/login', method: 'POST', body: { email: 'admin@demo.test', password: 'admin123' } });
  assert.equal(login.status, 200);
  const adminTok = login.data.token;

  const vehicles = await erp({ path: '/api/vehicles', headers: { Authorization: `Bearer ${adminTok}` } });
  assert.ok(vehicles.data.length >= 3, 'demo tenant has 3 vehicles');
  const vids = vehicles.data.map((v) => v.id);

  // admin key: clientId now required
  const noCli = await erp({ path: '/api/integration/keys', method: 'POST', headers: { Authorization: `Bearer ${adminTok}` }, body: { name: 'no-cli' } });
  assert.equal(noCli.status, 400, 'key without clientId rejected');

  const keyRes = await erp({ path: '/api/integration/keys', method: 'POST', headers: { Authorization: `Bearer ${adminTok}` }, body: { name: `erp-browser ${Date.now()}`, clientId: `cli-browser-${Date.now()}` } });
  assert.equal(keyRes.status, 201);
  const key = keyRes.data.key;
  assert.ok(key.startsWith('fk_'), 'key format fk_…');
  const dupCli = await erp({ path: '/api/integration/keys', method: 'POST', headers: { Authorization: `Bearer ${adminTok}` }, body: { name: 'dup', clientId: keyRes.data.clientId } });
  assert.equal(dupCli.status, 409, 'clientId unique');

  const cat = await erp({ path: '/api/integration/vehicles', headers: { Authorization: `Bearer ${key}` } });
  assert.equal(cat.status, 200);
  assert.deepEqual(cat.data.map((v) => v.id).sort(), [...vids].sort(), 'catalog matches admin vehicles');
  assert.ok(cat.data.every((v) => v.imei), 'catalog exposes imei');

  // ERP self-register: erpClientId + admin email/password
  const erpId = `erp-self-${Date.now()}`;
  const badPw = await erp({ path: '/api/integration/register', method: 'POST', body: { erpClientId: erpId, email: 'admin@demo.test', password: 'wrong' } });
  assert.equal(badPw.status, 401, 'wrong admin password rejected');
  const reg = await erp({ path: '/api/integration/register', method: 'POST', body: { erpClientId: erpId, email: 'admin@demo.test', password: 'admin123' } });
  assert.equal(reg.status, 201, 'register succeeds');
  assert.equal(reg.data.erpClientId, erpId);
  assert.ok(reg.data.apiKey.startsWith('fk_'), 'register returns api key');

  // re-register rotates: old key dies, new key works
  const reg2 = await erp({ path: '/api/integration/register', method: 'POST', body: { erpClientId: erpId, email: 'admin@demo.test', password: 'admin123' } });
  assert.equal(reg2.status, 201);
  assert.notEqual(reg2.data.apiKey, reg.data.apiKey, 'rotate mints a fresh key');
  const oldKeyDead = await erp({ path: '/api/integration/vehicles', headers: { Authorization: `Bearer ${reg.data.apiKey}` } });
  assert.equal(oldKeyDead.status, 401, 'old key dies on rotation');

  const regKey = reg2.data.apiKey;

  // body-only session mint: erpClientId + apiKey + vehicle list + session length
  const wrongClient = await erp({ path: '/api/integration/session', method: 'POST', body: { erpClientId: 'someone-else', apiKey: regKey, vehicleIds: vids, sessionLengthSeconds: 120 } });
  assert.equal(wrongClient.status, 403, 'wrong erpClientId rejected');
  const noClient = await erp({ path: '/api/integration/session', method: 'POST', body: { apiKey: regKey, vehicleIds: vids, ttlSeconds: 300 } });
  assert.equal(noClient.status, 403, 'missing erpClientId rejected');
  const bodySession = await erp({ path: '/api/integration/session', method: 'POST', body: { erpClientId: erpId, apiKey: regKey, vehicleIds: vids, sessionLengthSeconds: 120 } });
  assert.equal(bodySession.status, 200, 'body-only auth accepted');
  assert.equal(bodySession.data.expiresIn, 120, 'session_length honoured');
  assert.deepEqual(bodySession.data.vehicleIds.sort(), [...vids].sort());

  // header-style session still works (admin-issued key with matching clientId)
  const noCliHeader = await erp({ path: '/api/integration/session', method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { vehicleIds: vids, ttlSeconds: 300 } });
  assert.equal(noCliHeader.status, 403, 'bound key without clientId rejected');
  const wrongCliHeader = await erp({ path: '/api/integration/session', method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { vehicleIds: vids, ttlSeconds: 300, clientId: 'someone-else' } });
  assert.equal(wrongCliHeader.status, 403, 'wrong clientId rejected');
  const okCli = await erp({ path: '/api/integration/session', method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { vehicleIds: vids, ttlSeconds: 300, clientId: keyRes.data.clientId } });
  assert.equal(okCli.status, 200, 'matching clientId accepted');

  const session = bodySession;

  const imeis = cat.data.map((v) => v.imei);
  await pushFrames(imeis.map((imei, i) => h02Frame(imei, 44.89 + i * 0.01, 7.36 + i * 0.01, 20 + i)));
  await sleep(800);

  const wsOut = await page.evaluate(async ({ token }) => {
    const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);
    const got = { snapshots: [], positions: 0 };
    await new Promise((resolve) => {
      const timer = setTimeout(() => { ws.close(); resolve(); }, 10000);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'snapshot') got.snapshots.push(m.positions.length);
        if (m.type === 'position') got.positions++;
      };
      ws.onerror = () => { clearTimeout(timer); resolve(); };
    });
    return got;
  }, { token: session.data.token });

  assert.ok(wsOut.snapshots.length >= 1, 'received snapshot on connect');
  assert.ok(wsOut.snapshots[0] >= 3, `snapshot has latest positions (got ${wsOut.snapshots[0]})`);

  await pushFrames(imeis.map((imei, i) => h02Frame(imei, 44.89 + i * 0.01, 7.36 + i * 0.01, 30 + i)));
  assert.ok(wsOut.positions >= 1, `received live position events (got ${wsOut.positions})`);

  const moves = await page.evaluate(async ({ token }) => {
    const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);
    const byVehicle = new Map();
    const got = [];
    await new Promise((resolve) => {
      const timer = setTimeout(() => { ws.close(); resolve(); }, 16000);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type !== 'position') return;
        const cur = byVehicle.get(m.vehicleId);
        if (cur) {
          const dtMs = new Date(m.position.recordedAt) - new Date(cur.recordedAt);
          if (dtMs < 3000) { byVehicle.set(m.vehicleId, m.position); return; } // same tick burst — keep latest
          got.push({ vehicleId: m.vehicleId, speedKn: m.position.speedKn, course: m.position.course, dtMs });
          clearTimeout(timer); ws.close(); resolve();
        } else {
          byVehicle.set(m.vehicleId, m.position);
        }
      };
      ws.onerror = () => { clearTimeout(timer); resolve(); };
    });
    return got;
  }, { token: session.data.token });

  assert.ok(moves.length >= 1, 'two consecutive positions seen');
  const m = moves[0];
  assert.ok(Math.abs(m.dtMs - 5000) < 1500, `cadence ~5s (got ${m.dtMs}ms)`);
  assert.ok(m.speedKn > 15 && m.speedKn < 28, `velocity ~40 km/h (got ${m.speedKn.toFixed(1)} kn)`);
  assert.ok(Math.abs(m.course - 90) < 15, `heading ~90° east (got ${m.course}°)`);

  const keyList = await erp({ path: '/api/integration/keys', headers: { Authorization: `Bearer ${adminTok}` } });
  const keyRow = keyList.data.find((k) => k.name === keyRes.data.name);
  assert.ok(keyRow, 'key listed');
  const revoked = await erp({ path: `/api/integration/keys/${keyRow.id}/revoke`, method: 'POST', headers: { Authorization: `Bearer ${adminTok}` } });
  assert.equal(revoked.status, 204, 'revoke succeeds');

  const afterRevoke = await erp({ path: '/api/integration/session', method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { vehicleIds: vids, ttlSeconds: 300, clientId: keyRes.data.clientId } });
  assert.equal(afterRevoke.status, 401, 'revoked key rejected');
});

test('cross-tenant isolation: foreign vehicle + non-admin rejected', async () => {
  const login = await erp({ path: '/api/login', method: 'POST', body: { email: 'user@demo.test', password: 'user123' } });
  const userTok = login.data.token;
  const userDenied = await erp({ path: '/api/integration/session', method: 'POST', headers: { Authorization: `Bearer ${userTok}` }, body: { vehicleIds: [1], ttlSeconds: 300 } });
  assert.equal(userDenied.status, 403, 'user role cannot mint sessions');

  const badKey = await erp({ path: '/api/integration/vehicles', headers: { Authorization: 'Bearer fk_does-not-exist' } });
  assert.equal(badKey.status, 401, 'bad key rejected');
});
