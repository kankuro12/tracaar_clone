// h02_emulator.js - Node.js equivalent of h02_emulator1.py
//
// Emulates multiple H02-protocol GPS trackers over TCP.
// Each device has its own socket and its own send timer.
//
// Usage:  node h02_emulator.js   (Ctrl+C to stop)

const net = require("net");
const fs = require("fs");

const TARGET_HOST = "103.250.133.128";
const TARGET_PORT = 8090;

const ROUTE_CSV = "route_dense.csv";

const NUM_DEVICES = 10;
const IMEIS = Array.from({ length: NUM_DEVICES }, (_, i) =>
  String(1000000001 + i).padStart(10, "0")
);

const SEND_INTERVAL_SEC = 2.0;
const RUN_SECONDS = 300;

// ---------------------------------------------------------------------
// Route loading
// ---------------------------------------------------------------------
function loadRoute(path) {
  const lines = fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const headers = lines[0].split(",");
  const latIdx = headers.indexOf("lat");
  const lonIdx = headers.indexOf("lon");
  if (latIdx < 0 || lonIdx < 0)
    throw new Error("Route CSV needs 'lat' and 'lon' columns");

  const points = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c[latIdx] !== undefined && c[lonIdx] !== undefined)
      points.push([parseFloat(c[latIdx]), parseFloat(c[lonIdx])]);
  }
  if (points.length < 2) throw new Error("Route must have at least 2 points");
  return points;
}

// ---------------------------------------------------------------------
// Geometry helpers (ported 1:1 from the Python original)
// ---------------------------------------------------------------------
function haversineM(p1, p2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const [lat1, lon1] = p1;
  const [lat2, lon2] = p2;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dphi = (lat2 - lat1) * toRad;
  const dlambda = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDeg(p1, p2) {
  const toRad = Math.PI / 180;
  const [lat1, lon1] = p1.map((v) => v * toRad);
  const [lat2, lon2] = p2.map((v) => v * toRad);
  const dlon = lon2 - lon1;
  const x = Math.sin(dlon) * Math.cos(lat2);
  const y =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlon);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------------
// H02 packet builder
// ---------------------------------------------------------------------
function toH02Lat(lat) {
  const hemi = lat >= 0 ? "N" : "S";
  lat = Math.abs(lat);
  const deg = Math.floor(lat);
  const minutes = (lat - deg) * 60;
  return [String(deg).padStart(2, "0") + minutes.toFixed(4).padStart(7, "0"), hemi];
}

function toH02Lon(lon) {
  const hemi = lon >= 0 ? "E" : "W";
  lon = Math.abs(lon);
  const deg = Math.floor(lon);
  const minutes = (lon - deg) * 60;
  return [String(deg).padStart(3, "0") + minutes.toFixed(4).padStart(7, "0"), hemi];
}

function buildH02Packet(imei, lat, lon, speedKmh, headingDeg) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const hhmmss = pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds());
  const ddmmyy = pad(now.getUTCDate()) + pad(now.getUTCMonth() + 1) + String(now.getUTCFullYear()).slice(-2);
  const [latStr, ns] = toH02Lat(lat);
  const [lonStr, ew] = toH02Lon(lon);
  const speedKnots = speedKmh * 0.539957;
  return (
    `*HQ,${imei},V1,${hhmmss},A,` +
    `${latStr},${ns},${lonStr},${ew},` +
    `${speedKnots.toFixed(2).padStart(6, "0")},${Math.round(headingDeg)},${ddmmyy},FFFFFFFF#`
  );
}

// ---------------------------------------------------------------------
// Simulated device: own socket + own send timer
// ---------------------------------------------------------------------
class Device {
  constructor(imei, route, startIndex, direction, baseSpeed) {
    this.imei = imei;
    this.route = route;
    this.lastIdx = route.length - 1;
    this.index = startIndex;
    this.dir = direction;
    this.baseSpeed = baseSpeed;
    this.sock = null;
    this.timer = null;
  }

  connect(pending) {
    const s = new net.Socket();
    this.sock = s;
    s.setTimeout(5000);
    s.on("error", (e) => console.log(`[${this.imei}] socket error: ${e.message}`));
    s.on("timeout", () => s.destroy());
    s.connect(TARGET_PORT, TARGET_HOST, () => {
      if (pending) s.write(pending);
    });
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.sock) this.sock.destroy();
  }

  send(packet) {
    const s = this.sock;
    if (s && !s.destroyed && s.readyState === "open") {
      s.write(packet);
      return;
    }
    this.connect(packet); // reconnect, then send
  }

  neighborIndex() {
    const ni = this.index + this.dir;
    if (ni < 0) return 0;
    if (ni > this.lastIdx) return this.lastIdx;
    return ni;
  }

  step(distToCover) {
    let remaining = distToCover;
    while (remaining > 0) {
      const ni = this.neighborIndex();
      if (ni === this.index) {
        this.dir *= -1;
        break;
      }
      const segDist = haversineM(this.route[this.index], this.route[ni]);
      if (segDist === 0 || remaining < segDist) break;
      remaining -= segDist;
      this.index = ni;
      if (this.index <= 0 || this.index >= this.lastIdx) this.dir *= -1;
    }
  }

  start(interval) {
    this.connect();
    this.timer = setInterval(() => {
      const speed = Math.max(0, this.baseSpeed + (Math.random() * 20 - 10));
      const p1 = this.route[this.index];
      const ni = this.neighborIndex();
      const p2 = this.route[ni];
      const heading = ni !== this.index ? bearingDeg(p1, p2) : 0.0;
      const packet = buildH02Packet(this.imei, p1[0], p1[1], speed, heading);
      this.send(packet);
      const speedMps = (speed * 1000) / 3600;
      this.step(speedMps * interval);
    }, interval * 1000);
  }
}

if (require.main === module) {
// ---------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------
const route = loadRoute(ROUTE_CSV);
console.log(`Loaded route with ${route.length} points`);

const devices = IMEIS.map((imei, i) => {
  const startIndex = Math.floor(Math.random() * route.length);
  const direction = Math.random() < 0.5 ? 1 : -1;
  const baseSpeed = 20 + Math.random() * 40;
  const dev = new Device(imei, route, startIndex, direction, baseSpeed);
  setTimeout(() => dev.start(SEND_INTERVAL_SEC), i * 200); // stagger
  return dev;
});

function shutdown(reason) {
  console.log(`\n${reason}, stopping devices...`);
  devices.forEach((d) => d.close());
  console.log("All devices done.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("Ctrl+C received"));
if (RUN_SECONDS !== null)
  setTimeout(() => shutdown(`RUN_SECONDS (${RUN_SECONDS}s) elapsed`), RUN_SECONDS * 1000);
}

module.exports = { buildH02Packet, toH02Lat, toH02Lon, haversineM, bearingDeg, loadRoute, Device, IMEIS };
