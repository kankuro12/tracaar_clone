// End-to-end check of the ERP integration flow:
//   1. mint a short-lived session token via the REST API (integration key)
//   2. connect a WebSocket with that token
//   3. assert the client receives live positions + snapshot for the allowed vehicles
// Usage: node scripts/erp-test.js [--key <integration-key>]
require('dotenv').config();
const WebSocket = require('ws');

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const WS = BASE.replace(/^http/, 'ws');

async function main() {
  const keyArg = process.argv.find((a) => a.startsWith('--key='));
  let key = keyArg && keyArg.split('=')[1];
  if (!key) {
    const login = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.test', password: 'admin123' }),
    });
    const { token } = await login.json();
    const adminVehicles = await fetch(`${BASE}/api/vehicles`, { headers: { authorization: `Bearer ${token}` } });
    const vids = (await adminVehicles.json()).map((v) => v.id);
    const k = await fetch(`${BASE}/api/integration/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'erp-test', clientId: `erp-test-${Date.now()}` }),
    });
    if (k.status !== 201) throw new Error(`key creation failed: ${k.status} ${await k.text()}`);
    key = (await k.json()).key;
    console.log(`minted integration key ${key}`);
    return finish({ key, vids, token });
  }
  const cat = await fetch(`${BASE}/api/integration/vehicles`, { headers: { authorization: `Bearer ${key}` } });
  const vids = (await cat.json()).map((v) => v.id);
  return finish({ key, vids });
}

async function finish({ key, vids }) {
  const clientIdArg = process.argv.find((a) => a.startsWith('--clientId='));
  const clientId = clientIdArg && clientIdArg.split('=')[1];
  const ttl = 300;
  const session = await fetch(`${BASE}/api/integration/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ vehicleIds: vids, ttlSeconds: ttl, ...(clientId && { clientId }) }),
  });
  if (session.status !== 200) throw new Error(`session mint failed: ${session.status} ${await session.text()}`);
  const s = await session.json();
  if (!s.token || s.vehicleIds.length !== vids.length || s.expiresIn > ttl) throw new Error('bad session response');
  console.log(`session token minted for ${s.vehicleIds.length} vehicles, expires in ${s.expiresIn}s`);

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/ws?token=${s.token}`);
    let snapshots = 0, positions = 0;
    const timeout = setTimeout(() => reject(new Error(`timeout — got ${snapshots} snapshot(s), ${positions} position(s)`)), 20_000);
    ws.on('open', () => console.log('ws connected with session token'));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'snapshot') { snapshots++; console.log(`snapshot: ${m.positions.length} latest positions`); }
      if (m.type === 'position') { positions++; if (positions <= 3) console.log(`live position: vehicle ${m.vehicleId} @ ${m.position.lat.toFixed(5)},${m.position.lon.toFixed(5)}`); }
    });
    ws.on('error', reject);
    setTimeout(() => {
      clearTimeout(timeout);
      ws.close();
      console.log(`OK: ${snapshots} snapshot, ${positions} live positions received`);
      resolve();
    }, 8000);
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
