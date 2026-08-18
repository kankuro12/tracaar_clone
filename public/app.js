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
  return L.divIcon({ className: '', html: `<div class="marker-dot ${cls}">${inner}</div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
}

/* ---------- sidebar ---------- */
function renderSidebar() {
  const list = document.getElementById('vehicle-list');
  if (state.vehicles.size === 0) {
    list.innerHTML = '<div class="no-vehicles">No vehicles assigned to your account.</div>';
    return;
  }
  list.innerHTML = '';
  for (const v of state.vehicles.values()) {
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
          <span class="${online ? '' : 'stale'}">${v.position ? timeSince(v.position.recordedAt) : 'no data'}</span>
        </div>
      </div>`;
    row.addEventListener('click', () => toggleSelect(v.id));
    list.appendChild(row);
  }
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
    state.markers.get(v.id).setIcon(markerIcon(v, state.selected.has(v.id)));
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
    m.setIcon(markerIcon(v, state.selected.has(v.id)));
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
    state.markers.get(v.id).setLatLng([msg.position.lat, msg.position.lon]);
    state.markers.get(v.id).setIcon(markerIcon(v, state.selected.has(v.id)));
    state.markers.get(v.id).bindPopup(popupHtml(v));
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
