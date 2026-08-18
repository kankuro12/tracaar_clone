const WebSocket = require('ws');
const BASE = 'http://localhost:3000';
(async () => {
  const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.test', password: 'admin123' }) });
  const { token } = await login.json();
  const veh = await fetch(`${BASE}/api/vehicles`, { headers: { authorization: `Bearer ${token}` } });
  const vids = (await veh.json()).map((v) => v.id);
  console.log('admin vehicles:', vids.join(','));
  const k = await fetch(`${BASE}/api/integration/keys`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'dbg', clientId: 'dbg-' + Date.now() }) });
  const key = (await k.json()).key;
  const sess = await fetch(`${BASE}/api/integration/session`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ clientId: 'dbg-' + Date.now().toString().slice(0, -6), vehicleIds: vids, ttlSeconds: 300 }) }).catch((e) => console.log('sess err', e.message));
  const s = await sess.json();
  console.log('minted, vids:', s.vehicleIds.join(','), 'err?', s.error);
  const ws = new WebSocket(`ws://localhost:3000/ws?token=${s.token}`);
  const seen = [];
  ws.on('open', () => console.log('ws open'));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    seen.push(m.type);
    if (m.type === 'snapshot') console.log('snapshot positions:', m.positions.length);
    if (m.type === 'position') console.log('position vehicle', m.vehicleId);
  });
  ws.on('close', (c, r) => console.log('ws close', c, r.toString()));
  ws.on('error', (e) => console.log('ws error', e.message));
  setTimeout(() => { console.log('frame types seen:', seen.join(',')); ws.close(); process.exit(0); }, 12000);
})();
