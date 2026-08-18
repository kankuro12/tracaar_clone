// Simulates Sinotrack H02 devices with faker-generated vehicle identities and
// realistic movement: each vehicle drives between random city waypoints, stops
// for deliveries, and reports a live H02 frame every STEP_S seconds.
//
// Usage: node scripts/simulate.js [--count 5]
//   - registers vehicles via the admin API when DEVICE_IMEIS isn't given
//   - DEVICE_IMEIS=imei1,imei2 forces specific devices (no registration)
require('dotenv').config();
const net = require('net');
const { faker } = require('@faker-js/faker');

faker.seed(1234);

const PORT = +process.env.PORT || 3000;
const INGEST_PORT = +process.env.INGEST_PORT || 9000;
const BASE = { lat: +process.env.BASE_LAT || 44.8993, lon: +process.env.BASE_LON || 7.3636 };
const STEP_S = +process.env.STEP_S || 5;
const HEADING = process.env.HEADING == null ? null : +process.env.HEADING; // fixed bearing (deg, 0=N)
const SPEED_KMH = +process.env.SPEED_KMH || 40; // used when HEADING is set
const API = `http://localhost:${PORT}`;

const KN_TO_KMH = 1.852;

function toNmea(coord, isLat) {
  const hemi = coord < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
  const a = Math.abs(coord);
  const deg = Math.floor(a);
  const min = (a - deg) * 60;
  return [((deg * 100 + min).toFixed(4)).padStart(isLat ? 7 : 8, '0'), hemi];
}

function frame(imei, lat, lon, speedKn, course) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const date = `${pad(now.getUTCDate())}${pad(now.getUTCMonth() + 1)}${String(now.getUTCFullYear()).slice(2)}`;
  const [ln, lh] = toNmea(lat, true);
  const [lo, oh] = toNmea(lon, false);
  return `*HQ,${imei},V1,${time},A,${ln},${lh},${lo},${oh},${speedKn.toFixed(2)},${String(Math.round(course)).padStart(3, '0')},${date},FBF7BBFF,222,10,11032,27783#`;
}

const haversineM = (a, b) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

async function login() {
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.SIM_EMAIL || 'admin@demo.test', password: process.env.SIM_PASSWORD || 'admin123' }),
  });
  if (!r.ok) throw new Error(`login failed: ${await r.text()}`);
  return (await r.json()).token;
}

async function registerVehicles(token, count) {
  const existing = await fetch(`${API}/api/vehicles`, { headers: { authorization: `Bearer ${token}` } });
  const seen = new Map((await existing.json()).map((v) => [v.imei, v]));
  const list = [];
  for (let i = 0; i < count; i++) {
    const imei = `86${faker.string.numeric(13)}`;
    const name = `${faker.vehicle.vehicle()} ${faker.word.adjective({ length: 6 })}`.slice(0, 40);
    const plate = `${faker.string.alpha(2).toUpperCase()} ${faker.number.int({ min: 100, max: 999 })} ${faker.string.alphanumeric(2).toUpperCase()}`;
    let v = seen.get(imei);
    if (!v) {
      const r = await fetch(`${API}/api/vehicles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, imei, plate }),
      });
      if (r.status === 409) { // imei collision, retry with new one
        continue;
      }
      if (!r.ok) throw new Error(`vehicle registration failed: ${await r.text()}`);
      v = await r.json();
      console.log(`registered ${name} (${imei}, ${plate})`);
    }
    list.push({ imei, ...v });
  }
  if (list.length < count) return registerVehicles(token, count); // ponytail: retry collided imeis
  return list;
}

function randomDest(from) {
  const d = faker.location.nearbyGPSCoordinate({ origin: [from.lat, from.lon], radius: 2500, isMetric: true });
  return { lat: d[0], lon: d[1] };
}

function simulateVehicle({ imei, id }) {
  const v = {
    lat: BASE.lat + (faker.number.float({ min: -0.01, max: 0.01 })),
    lon: BASE.lon + (faker.number.float({ min: -0.01, max: 0.01 })),
    speedKmh: 0,
    course: faker.number.int({ min: 0, max: 359 }),
    dest: null,
    stopUntil: 0,
  };

  const sock = net.connect(INGEST_PORT, '127.0.0.1', () => {
    console.log(`sim: ${imei} (id ${id}) streaming every ${STEP_S}s`);
    const tick = () => {
      const now = Date.now();
      if (HEADING != null) {
        // fixed course at constant velocity — no delivery stops
        const step = (SPEED_KMH / 3.6) * STEP_S;
        v.course = HEADING;
        v.lat += (step * Math.cos((HEADING * Math.PI) / 180)) / 111320;
        v.lon += (step * Math.sin((HEADING * Math.PI) / 180)) / (111320 * Math.cos((v.lat * Math.PI) / 180));
        sock.write(frame(imei, v.lat, v.lon, SPEED_KMH / KN_TO_KMH, v.course));
        return;
      }
      if (now < v.stopUntil) {
        v.speedKmh = 0; // parked — faker pauses like a real delivery stop
      } else {
        if (!v.dest) {
          v.dest = randomDest(v);
          v.stopUntil = 0;
        }
        const dist = haversineM(v, v.dest);
        if (dist < 25) {
          v.dest = null;
          v.speedKmh = 0;
          v.stopUntil = now + faker.number.int({ min: 30_000, max: 300_000 }); // delivery
        } else {
          v.speedKmh = faker.number.float({ min: 18, max: 72, fractionDigits: 1 });
          const step = (v.speedKmh / 3.6) * STEP_S; // meters per tick
          v.course = (Math.atan2(v.dest.lon - v.lon, v.dest.lat - v.lat) * 180) / Math.PI;
          v.lat += (step * Math.cos((v.course * Math.PI) / 180)) / 111320;
          v.lon += (step * Math.sin((v.course * Math.PI) / 180)) / (111320 * Math.cos((v.lat * Math.PI) / 180));
        }
      }
      sock.write(frame(imei, v.lat, v.lon, v.speedKmh / KN_TO_KMH, v.course));
    };
    tick();
    setInterval(tick, STEP_S * 1000);
  });
  sock.on('error', (e) => console.error(`sim: ${imei} error: ${e.message}`));
}

async function main() {
  const forced = (process.env.DEVICE_IMEIS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const count = +(process.argv.find((a) => a.startsWith('--count=')) || '').split('=')[1] || 3;
  if (forced.length) {
    forced.forEach((imei, i) => simulateVehicle({ imei, id: i + 1 }));
    return;
  }
  if (!process.argv.includes('--register')) {
    // pure device mode — like a real H02 tracker: no login, no registration.
    // Register the IMEIs first (super admin console → customer → Assign IMEI)
    // or the ingest will discard the frames.
    for (let i = 0; i < count; i++) simulateVehicle({ imei: `86${faker.string.numeric(13)}`, id: i + 1 });
    console.log(`sim: device mode — ${count} fake IMEIs streaming, no auth (H02 has none)`);
    return;
  }
  const token = await login();
  const vehicles = await registerVehicles(token, count);
  vehicles.forEach((v) => simulateVehicle(v));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
