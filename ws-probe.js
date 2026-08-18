const net = require('net');
const WebSocket = require('ws');
(async () => {
  const login = await fetch('http://localhost:3000/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.test', password: 'admin123' }) });
  const { token } = await login.json();
  const sess = await fetch('http://localhost:3000/api/integration/session', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ vehicleIds: [1], ttlSeconds: 120 }) });
  const s = await sess.json();
  console.log('minted', s.vehicleIds);
  const ws = new WebSocket('ws://localhost:3000/ws?token=' + s.token);
  ws.on('open', () => {
    console.log('ws open');
    const sock = net.connect(9000, '127.0.0.1', () => sock.write('*HQ,867421030123456,V1,094000,A,4502.5000,N,00736.5000,E,060.0,000,200818,FFFFFBFF#'));
    sock.on('error', (e) => console.log('sock err', e.message));
  });
  ws.on('message', (r) => {
    const m = JSON.parse(r);
    if (m.type === 'position') console.log('LIVE POSITION v' + m.vehicleId, m.position.lat, m.position.lon);
    else if (m.type === 'snapshot') console.log('snapshot positions:', m.positions.length);
    else console.log('msg', m.type);
  });
  ws.on('error', (e) => console.log('ws err', e.message));
  setTimeout(() => process.exit(0), 6000);
})();
