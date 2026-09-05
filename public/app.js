/* Fleet dashboard: live map + vehicle sidebar. Vanilla JS, no build step. */

const ONLINE_MS = 3 * 60 * 1000;
const TRAIL_MS = 6 * 3600 * 1000;
const DEFAULT_CENTER = [44.8993, 7.3636];

const token = window.FLEET && window.FLEET.token;
const user = window.FLEET && window.FLEET.user;
if (!token || !user) location.href = '/login';

const map = L.map('map').setView(DEFAULT_CENTER, 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const state = {
  vehicles: new Map(), // id -> vehicle record
  selected: new Set(),
  markers: new Map(),  // id -> leaflet marker
  trail: null,
  geofences: [],
  banners: [],
};

let ws = null; // realtime socket (set by connectWs)

/* ---------- helpers ---------- */
const kmh = (kn) => Math.round((kn || 0) * 1.852);
const fmt = (n) => n.toFixed(1);

function timeSince(ts) {
  const t = ts ? new Date(ts).getTime() : NaN;
  if (Number.isNaN(t)) return '—';
  const d = Date.now() - t;
  if (d < 60_000) return 'now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m`;
  const h = Math.floor(d / 3600_000);
  return `${h}h ${Math.floor((d % 3600_000) / 60_000)}m`;
}

const isOnline = (v) => v.position && Date.now() - new Date(v.position.recordedAt).getTime() < ONLINE_MS;

function markerIcon(v, selected) {
  const cls = selected ? 'selected' : isOnline(v) ? 'online' : 'offline';
  const inner = isOnline(v) ? '<span class="pulse"></span>' : '';
  const arrow = v.position && (v.position.course != null || anim.has(v.id))
    ? `<span class="arrow" style="transform: rotate(${(anim.get(v.id)?.headingDeg ?? v.position.course) ?? 0}deg)"><svg viewBox="0 0 12 18"><path d="M6 0 L12 8 H8.5 V18 H3.5 V8 H0 Z"/></svg></span>` : '';
  return L.divIcon({ className: '', html: `<div class="marker-dot ${cls}">${arrow}${inner}</div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
}

/* ---------- sidebar ---------- */
function renderSidebar() {
  const list = document.getElementById('vehicle-list');
  const q = (document.getElementById('vehicle-search')?.value || '').toLowerCase();
  const items = [...state.vehicles.values()].filter((v) => v.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('vehicle-count-badge').textContent = `${items.length} / ${state.vehicles.size}`;
  if (items.length === 0) {
    list.innerHTML = '<div class="no-vehicles">No vehicles match.</div>';
    return;
  }
  list.innerHTML = '';
  for (const v of items) {
    const row = document.createElement('div');
    const online = isOnline(v);
    const selected = state.selected.has(v.id);
    row.className = `vehicle-row${selected ? ' selected' : ''}${online ? '' : ' offline'}`;
    row.innerHTML = `
      <span class="row-dot ${online ? '' : 'offline'}"></span>
      <div class="row-main">
        <div class="row-name">${escapeHtml(v.name)}</div>
        <div class="row-meta">
          <span>${v.position ? `${kmh(v.position.speedKn)} km/h` : '—'}</span>
          ${ignitionTag(v.position ? v.position.ignition : null)}
          <span class="${online ? '' : 'stale'}">${v.position ? timeSince(v.position.recordedAt) : 'no data'}</span>
        </div>
      </div>`;
    row.addEventListener('click', () => toggleSelect(v.id));
    list.appendChild(row);
  }
}

// Ignition (ACC) from the device status word. null means the device didn't
// report it, which is shown as its own state rather than as "off".
function ignitionTag(ignition) {
  if (ignition === null || ignition === undefined) return '';
  return ignition
    ? '<span class="ign on" title="Ignition on">IGN</span>'
    : '<span class="ign off" title="Ignition off">IGN</span>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- selection ---------- */
function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  applySelection();
}

function applySelection() {
  // keep the rt channel in sync — admins are auto-subscribed server-side,
  // 'user' role needs explicit per-vehicle subscribe/unsubscribe
  if (ws && ws.readyState === WebSocket.OPEN && user.role === 'user') {
    for (const id of state.selected) ws.send(JSON.stringify({ type: 'subscribe', vehicleId: id }));
    for (const v of state.vehicles.keys()) {
      if (!state.selected.has(v)) ws.send(JSON.stringify({ type: 'unsubscribe', vehicleId: v }));
    }
  }
  // single-select -> trail; multi-select / none -> no trail
  if (state.selected.size === 1) {
    const [id] = state.selected;
    drawTrail(id);
    focus(id);
  } else {
    if (state.trail) { state.trail.remove(); state.trail = null; }
    if (state.selected.size > 1) fitTo(state.selected);
    else fitTo(new Set(state.vehicles.keys()));
  }
  for (const v of state.vehicles.values()) {
    setMarkerIcon(v.id);
  }
  renderSidebar();
}

async function drawTrail(id) {
  if (state.trail) state.trail.remove();
  state.trail = null;
  const r = await fetch(`/api/vehicles/${id}/positions?from=${encodeURIComponent(new Date(Date.now() - TRAIL_MS).toISOString())}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return;
  const pts = (await r.json()).filter((p) => p.valid).map((p) => [p.lat, p.lon]);
  if (pts.length > 1) {
    state.trail = L.polyline(pts, { className: 'trail', interactive: false }).addTo(map);
  }
}

function focus(id) {
  const v = state.vehicles.get(id);
  if (v && v.position) map.fitBounds([[v.position.lat, v.position.lon]], { maxZoom: 16 });
}

function fitTo(ids) {
  const pts = [];
  for (const id of ids) {
    const v = state.vehicles.get(id);
    if (v && v.position) pts.push([v.position.lat, v.position.lon]);
  }
  if (pts.length === 1) map.fitBounds([pts[0]], { maxZoom: 16 });
  else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
}

document.getElementById('show-all').addEventListener('click', () => {
  state.selected.clear();
  applySelection();
});
document.getElementById('vehicle-search')?.addEventListener('input', renderSidebar);

/* ---------- markers ---------- */
function upsertVehicle(v, selectable) {
  const existing = state.vehicles.get(v.id);
  state.vehicles.set(v.id, v);
  let m = state.markers.get(v.id);
  if (!m) {
    m = L.marker([v.position ? v.position.lat : 0, v.position ? v.position.lon : 0], {
      icon: markerIcon(v, state.selected.has(v.id)),
      interactive: true,
    }).addTo(map);
    m.on('click', () => toggleSelect(v.id));
    state.markers.set(v.id, m);
  }
  if (v.position) {
    m.setLatLng([v.position.lat, v.position.lon]);
    setMarkerIcon(v.id);
    m.bindPopup(popupHtml(v));
  }
  if (!existing && selectable) renderSidebar();
  renderSidebar();
}

function popupHtml(v) {
  const online = isOnline(v);
  const rows = [];
  if (online) rows.push('<span class="online-tag">LIVE</span>');
  else rows.push('<span class="offline-tag">STALE</span>');
  rows.push(`${fmt(v.position.lat)}°, ${fmt(v.position.lon)}°`);
  rows.push(`${kmh(v.position.speedKn)} km/h`);
  if (v.position.ignition != null) {
    rows.push(v.position.ignition
      ? '<span class="online-tag">IGNITION ON</span>'
      : '<span class="offline-tag">IGNITION OFF</span>');
  }
  rows.push(`${timeSince(v.position.recordedAt)} ago`);
  if (v.plate) rows.push(escapeHtml(v.plate));
  if (v.destination && v.position) rows.push(`ETA ${etaMin(v.position, v.destination)} min`);
  return `<div class="popup-name">${escapeHtml(v.name)}</div>
    <div class="popup-data">${rows.join('<br>')}</div>`;
}

function etaMin(from, to) {
  // straight-line at current speed floor 5 km/h — ponytail: road-network ETA needs OSRM
  const d = haversineKm([from.lat, from.lon], [to.lat, to.lon]);
  const kmh = Math.max(5, from.speedKn * 1.852);
  return Math.round((d / kmh) * 60);
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ---------- geofences ---------- */
async function loadGeofences() {
  const r = await fetch('/api/geofences', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return;
  state.geofences = await r.json();
  for (const g of state.geofences) {
    L.circle([g.lat, g.lon], {
      radius: g.radius_m,
      className: 'geofence',
      interactive: false,
    }).addTo(map).bindTooltip(g.name, { permanent: false });
  }
}

/* ---------- alert banners ---------- */
function showAlert(alert) {
  const el = document.createElement('div');
  const cls = alert.type === 'offline' || alert.type === 'exit' ? 'alert-banner warn' : 'alert-banner';
  el.className = cls;
  el.textContent = alert.message;
  document.querySelector('.map-wrap').appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

async function loadAlerts() {
  const r = await fetch('/api/alerts?limit=10', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return;
  const alerts = await r.json();
  for (const a of alerts.slice(-5)) showAlert(a);
}

/* ---------- motion: correction tween + dead reckoning ---------- */
// Decouples rendering from fix arrival: ws handler only feeds state via onFix();
// a rAF loop applies the marker position every frame.
const MOTION = {
  correctionMs: 800,   // ease-out tween to each confirmed fix (~25% of typical 5s fix interval)
  anomalyMs: 3000,     // slower tween when a fix implies implausible speed (GPS glitch, not motion)
  maxKmh: 300,         // implied-speed threshold for anomaly detection
  drMs: 10000,         // dead reckoning ceiling — extrapolated speed decays to 0 here, so the marker
                       // creeps a short, believable way instead of barreling off-road in a straight line
  staleMs: ONLINE_MS,  // absolute freeze bound if no fix at all; refresh grays the marker out
};

const anim = new Map();   // id -> { pos, last, tween, heading, headingDeg, prevFix }
const arrows = new Map(); // id -> .arrow element (invalidated on every setIcon)

const shortestAngle = (from, to) => ((to - from + 540) % 360) - 180;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function setMarkerIcon(id) {
  arrows.delete(id);
  state.markers.get(id).setIcon(markerIcon(state.vehicles.get(id), state.selected.has(id)));
}

function setRotation(id, deg) {
  let el = arrows.get(id);
  if (!el) {
    const m = state.markers.get(id);
    el = m && m._icon && m._icon.querySelector('.arrow');
    if (!el) return;
    arrows.set(id, el);
  }
  el.style.transform = `rotate(${deg}deg)`;
}

function deadReckon(last, ms, decayMs) {
  // equirectangular projection, fine for sub-km extrapolation — ponytail: great-circle if longer hauls
  const s = (last.speedKn * 1.852) / 3.6; // m/s
  const t = ms / 1000;
  const T = decayMs ? decayMs / 1000 : 0;
  const d = T ? s * (t - (t * t) / (2 * T)) : s * t; // integrates speed decaying linearly to 0 at T
  const φ = (last.lat * Math.PI) / 180;
  const lat = last.lat + (d * Math.cos((last.course * Math.PI) / 180)) / 111_320;
  const lon = last.lon + (d * Math.sin((last.course * Math.PI) / 180)) / (111_320 * Math.cos(φ));
  return [lat, lon];
}

function bearingDeg(from, to) {
  const φ1 = (from[0] * Math.PI) / 180, φ2 = (to[0] * Math.PI) / 180;
  const Δλ = ((to[1] - from[1]) * Math.PI) / 180;
  return ((Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * 180) / Math.PI + 360) % 360;
}

function onFix(v, p) {
  let a = anim.get(v.id);
  const now = Date.now();
  if (!a) {
    a = { pos: [p.lat, p.lon], last: null, prevFix: null, tween: null, heading: null, headingDeg: p.course || 0 };
    anim.set(v.id, a);
  }
  const to = [p.lat, p.lon];
  const fixTime = p.recordedAt ? new Date(p.recordedAt).getTime() : now;
  const dt = a.last ? (fixTime - a.last.time) / 1000 : 0;
  const impliedKmh = dt > 0 ? (haversineKm(a.pos, to) / dt) * 3600 : 0;
  const anomalous = impliedKmh > MOTION.maxKmh;
  a.tween = { from: a.pos.slice(), to, start: now, dur: anomalous ? MOTION.anomalyMs : MOTION.correctionMs };
  const targetHeading = p.course != null ? p.course : a.prevFix ? bearingDeg(a.prevFix, to) : a.headingDeg;
  a.heading = { from: a.headingDeg, to: targetHeading, start: now, dur: MOTION.correctionMs };
  a.prevFix = to;
  a.last = { time: fixTime, lat: p.lat, lon: p.lon, speedKn: p.speedKn || 0, course: targetHeading };
}

function tickMotion() {
  const now = Date.now();
  for (const [id, a] of anim) {
    const m = state.markers.get(id);
    if (!m) continue;
    if (a.tween) {
      const t = Math.min(1, (now - a.tween.start) / a.tween.dur);
      const k = easeOut(t);
      a.pos = [
        a.tween.from[0] + (a.tween.to[0] - a.tween.from[0]) * k,
        a.tween.from[1] + (a.tween.to[1] - a.tween.from[1]) * k,
      ];
      if (t >= 1) { a.pos = a.tween.to; a.tween = null; }
    } else if (a.last && a.last.speedKn > 0 && now - a.last.time < MOTION.drMs) {
      a.pos = deadReckon(a.last, now - a.last.time, MOTION.drMs);
    }
    m.setLatLng(a.pos);
    if (state.selected.size === 1 && state.selected.has(id)) map.panTo(a.pos, { animate: false });
    if (a.heading) {
      const t = Math.min(1, (now - a.heading.start) / a.heading.dur);
      a.headingDeg = (a.heading.from + shortestAngle(a.heading.from, a.heading.to) * easeOut(t) + 360) % 360;
      if (t >= 1) a.heading = null;
    }
    setRotation(id, a.headingDeg);
  }
}

function motionLoop() {
  requestAnimationFrame(motionLoop);
  if (!document.hidden) tickMotion(); // rAF is already throttled when hidden; this is belt & braces
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  // resume from confirmed fixes, not from a stale mid-flight tween
  for (const a of anim.values()) {
    if (a.tween) { a.pos = a.tween.to; a.tween = null; }
    if (a.heading) { a.headingDeg = a.heading.to; a.heading = null; }
  }
});

/* ---------- realtime ---------- */
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  const dot = document.getElementById('live-dot');
  const label = document.getElementById('live-text');

  ws.onopen = () => {
    dot.classList.remove('lost');
    label.textContent = 'live';
    // spec 7: single-vehicle view subscribes explicitly; fleet view is server-side
    for (const id of state.selected) ws.send(JSON.stringify({ type: 'subscribe', vehicleId: id }));
  };
  ws.onclose = () => {
    dot.classList.add('lost');
    label.textContent = 'offline — no live updates';
    setTimeout(connectWs, 3000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'alert') { showAlert(msg.alert); return; }
    if (msg.type !== 'position') return;
    const v = state.vehicles.get(msg.vehicleId);
    if (!v) return;
    v.position = msg.position;
    onFix(v, msg.position); // feeds the render loop; never sets the marker directly
    const m = state.markers.get(v.id);
    setMarkerIcon(v.id);
    m.setPopupContent(popupHtml(v));
    if (state.selected.has(v.id) && state.selected.size === 1) {
      if (state.trail) state.trail.addLatLng([msg.position.lat, msg.position.lon]);
      else drawTrail(v.id);
    }
    renderSidebar();
  };

  window.addEventListener('beforeunload', () => ws.close());
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const r = await fetch('/api/vehicles', { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401) { location.href = '/login'; return; }
    if (!r.ok) throw new Error('failed to load fleet');
    const vehicles = await r.json();
    for (const v of vehicles) upsertVehicle(v, false);
    renderSidebar();
    loadGeofences();
    loadAlerts();
    document.getElementById('map-loading').style.display = 'none';
    if (vehicles.some((v) => v.position)) fitTo(new Set(vehicles.map((v) => v.id)));
    connectWs();
    motionLoop();
    setInterval(() => {
      for (const v of state.vehicles.values()) {
        state.markers.get(v.id)?.setIcon(markerIcon(v, state.selected.has(v.id)));
      }
      renderSidebar();
    }, 30_000);
  } catch (e) {
    const el = document.getElementById('map-loading');
    el.textContent = 'Failed to load fleet — try refreshing.';
    el.style.color = 'var(--danger)';
    console.error(e);
  }
}

boot();
