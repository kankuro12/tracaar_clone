# -*- coding: utf-8 -*-

SECTIONS_12_AND_13 = """
      <!-- ========================================================================= -->
      <!-- SECTION 12: HOW TO MINT & MANAGE INTEGRATION API KEYS -->
      <!-- ========================================================================= -->
      <section id="section-mint-keys" class="doc-section">
        <div class="section-header">
          <span class="section-number">12</span>
          <h2>How to Mint & Manage Integration API Keys</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Two Methods for Minting Integration API Keys</h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Every customer tenant has isolated access to their own vehicle fleet. Integration API keys (format: <code>fk_&lt;48 hex chars&gt;</code>) are bound to both a customer tenant and a unique ERP client identifier (<code>client_id</code>). Only the SHA-256 hash is stored on the server.
          </p>

          <!-- Method 1: Self-Service API Registration -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <span style="background: rgba(16, 185, 129, 0.2); color: var(--accent-green); font-weight: 700; font-size: 0.78rem; padding: 3px 8px; border-radius: 4px;">METHOD A</span>
              <strong style="color: var(--text-primary); font-size: 1.05rem;">Programmatic Self-Service Registration (API)</strong>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 14px;">
              ERP developers can programmatically mint their own API key by sending their desired <code>erpClientId</code> along with the email and password of their customer tenant administrator.
            </p>

            <div class="code-wrapper" id="mint-self-code">
              <div class="code-header">
                <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">POST /api/integration/register</span>
                <button class="copy-btn" onclick="copyCode(this, 'mint-self-raw')">Copy Request</button>
              </div>
              <pre id="mint-self-raw"><code>curl -X POST https://api.yourtrackinghost.com/api/integration/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "erpClientId": "odoo-production-instance",
    "email": "admin@yourcompany.com",
    "password": "TenantAdminPassword123!"
  }'</code></pre>
            </div>

            <div style="background: var(--bg-code); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px 16px; margin-top: 12px;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-green);">HTTP 201 CREATED RESPONSE:</span>
              <pre style="padding: 6px 0 0; background: transparent; font-size: 0.84rem; color: #a7f3d0;"><code>{
  "customerId": 2,
  "erpClientId": "odoo-production-instance",
  "apiKey": "fk_4f8e2a1b9c3d7e5f608192a3b4c5d6e7f8a9b0c1d2e3f4a5"
}</code></pre>
            </div>

            <div class="callout callout-info" style="margin-top: 14px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              <div>
                <strong>Zero-Downtime Key Rotation:</strong> Re-issuing a <code>POST /api/integration/register</code> request with the same <code>erpClientId</code> generates a fresh key and immediately replaces the previous key hash in the database.
              </div>
            </div>
          </div>

          <!-- Method 2: Dashboard UI Generation -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <span style="background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); font-weight: 700; font-size: 0.78rem; padding: 3px 8px; border-radius: 4px;">METHOD B</span>
              <strong style="color: var(--text-primary); font-size: 1.05rem;">Web Dashboard UI Generation (Platform Portal)</strong>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">
              Administrators can visually generate and manage integration keys through the web dashboard:
            </p>
            <ol style="padding-left: 20px; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.8; margin-bottom: 14px;">
              <li>Log in to the web dashboard (<code>/login</code>) as an administrator account.</li>
              <li>In the navigation bar, navigate to <strong>Integration</strong> (<code>/admin/integration</code>).</li>
              <li>Under <strong>New API Key</strong>, enter:
                <ul style="margin-top: 4px;">
                  <li><strong>Label / Name:</strong> e.g., <code>"Odoo Main ERP"</code></li>
                  <li><strong>Client ID (erp_client_id):</strong> e.g., <code>"odoo-prod"</code></li>
                </ul>
              </li>
              <li>Click <strong>Generate Key</strong>. Copy the raw key (<code>fk_...</code>) immediately, as it is displayed <strong>only once</strong>.</li>
            </ol>

            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 8px;">
              Equivalently via the Admin REST API:
            </p>
            <div class="code-wrapper">
              <pre><code>POST /api/integration/keys
Authorization: Bearer &lt;admin-jwt-token&gt;
Content-Type: application/json

{
  "name": "Odoo Production",
  "clientId": "odoo-prod"
}

HTTP/1.1 201 Created
{
  "name": "Odoo Production",
  "clientId": "odoo-prod",
  "key": "fk_9d4e5f6a7b8c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c"
}</code></pre>
            </div>
          </div>

          <!-- Key Revocation -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px;">
            <h4 style="color: var(--accent-rose); font-size: 0.95rem; margin-bottom: 8px;">Key Revocation & Leak Recovery</h4>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">
              If an API key is ever compromised, revoke it immediately via the Admin dashboard or by calling:
            </p>
            <pre><code>POST /api/integration/keys/:id/revoke
Authorization: Bearer &lt;admin-jwt-token&gt;

HTTP/1.1 204 No Content</code></pre>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 13: EMBEDDING LIVE MAP ON YOUR OWN ERP UI -->
      <!-- ========================================================================= -->
      <section id="section-live-map-ui" class="doc-section">
        <div class="section-header">
          <span class="section-number">13</span>
          <h2>Building a Live Telematics Map on Your Own ERP UI</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Architecture: Secure Backend Proxy Pattern</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            To securely render live vehicle markers on your ERP browser interface without exposing your master API key, follow the <strong>Backend Session Token Proxy Pattern</strong>:
          </p>

          <div style="background: var(--bg-code); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin: 18px 0; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; color: #93c5fd; line-height: 1.6;">
            1. User opens ERP Delivery Dashboard in Browser.<br>
            2. ERP Web Server calls <code>POST /api/integration/session</code> using server-side <code>apiKey</code> (e.g. TTL = 300s).<br>
            3. ERP Web Server embeds the short-lived <code>sessionToken</code> into the frontend component.<br>
            4. Browser opens <code>wss://api.yourtrackinghost.com/ws?token=&lt;sessionToken&gt;</code>.<br>
            5. Browser receives live positions, rotates vehicle heading markers, and renders real-time movement trails.
          </div>

          <h4 style="margin: 24px 0 12px; font-size: 1.05rem; color: var(--text-primary);">Interactive Frontend Components (Plain HTML, React, Angular)</h4>
          <p style="color: var(--text-secondary); margin-bottom: 14px;">
            Select your preferred frontend framework tab below for a full, copy-pasteable implementation:
          </p>

          <!-- Frontend Framework Tabs -->
          <div class="code-wrapper" id="live-map-tabs-box">
            <div class="code-header">
              <div class="code-tabs">
                <button class="code-tab-btn active" data-tab="html" onclick="selectTab('live-map-tabs-box', 'html')">Plain HTML / JS</button>
                <button class="code-tab-btn" data-tab="react" onclick="selectTab('live-map-tabs-box', 'react')">React (TSX / Hooks)</button>
                <button class="code-tab-btn" data-tab="angular" onclick="selectTab('live-map-tabs-box', 'angular')">Angular (Standalone Component)</button>
              </div>
              <button class="copy-btn" onclick="copyCode(this, 'live-map-active-code')">Copy Component Code</button>
            </div>

            <!-- Tab 1: Plain HTML / JS -->
            <div class="tab-pane" data-pane="html" style="display:block;">
              <pre id="live-map-active-code"><code>&lt;!DOCTYPE html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;
  &lt;meta charset="UTF-8"&gt;
  &lt;meta name="viewport" content="width=device-width, initial-scale=1.0"&gt;
  &lt;title&gt;ERP Live Fleet Tracking Map&lt;/title&gt;
  &lt;!-- Leaflet CSS --&gt;
  &lt;link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /&gt;
  &lt;style&gt;
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { display: flex; height: 100vh; background: #0f172a; color: #f8fafc; overflow: hidden; }
    
    /* Sidebar */
    #fleet-sidebar { width: 320px; background: #1e293b; border-right: 1px solid #334155; display: flex; flex-direction: column; z-index: 10; }
    .sidebar-head { padding: 16px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .sidebar-head h3 { font-size: 1rem; font-weight: 700; color: #38bdf8; }
    .status-pill { font-size: 0.7rem; padding: 2px 8px; border-radius: 9999px; background: #065f46; color: #34d399; font-weight: 600; }
    .status-pill.offline { background: #7f1d1d; color: #f87171; }
    
    #vehicle-list { flex: 1; overflow-y: auto; padding: 12px; }
    .vehicle-card { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
    .vehicle-card:hover, .vehicle-card.active { border-color: #38bdf8; background: #172554; }
    .vehicle-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; display: flex; justify-content: space-between; }
    .vehicle-meta { font-size: 0.75rem; color: #94a3b8; display: flex; justify-content: space-between; }
    
    /* Map Area */
    #map-container { flex: 1; position: relative; height: 100%; }
    #map { width: 100%; height: 100%; background: #0b0f19; }
    
    /* Directional Marker */
    .marker-dot { width: 20px; height: 20px; border-radius: 50%; background: #38bdf8; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(56, 189, 248, 0.6); position: relative; display: flex; align-items: center; justify-content: center; }
    .marker-dot.offline { background: #94a3b8; box-shadow: none; }
    .marker-dot .arrow { width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 10px solid #ffffff; position: absolute; top: -14px; transform-origin: 50% 24px; }
    .pulse-ring { position: absolute; width: 100%; height: 100%; border-radius: 50%; animation: pulse 2s infinite; border: 2px solid #38bdf8; opacity: 0; }
    @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.5); opacity: 0; } }
    
    /* Movement Trail */
    .leaflet-interactive.trail-line { stroke: #38bdf8; stroke-width: 3; stroke-dasharray: 6, 6; filter: drop-shadow(0 0 4px #0284c7); }
    
    /* Alert Toast */
    #alert-toast-container { position: absolute; top: 20px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
    .alert-toast { background: rgba(30, 41, 59, 0.95); border-left: 4px solid #f59e0b; color: #f8fafc; padding: 12px 16px; border-radius: 6px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); font-size: 0.85rem; }
  &lt;/style&gt;
&lt;/head&gt;
&lt;body&gt;

  &lt;!-- Sidebar --&gt;
  &lt;aside id="fleet-sidebar"&gt;
    &lt;div class="sidebar-head"&gt;
      &lt;h3&gt;Fleet Telematics&lt;/h3&gt;
      &lt;span id="conn-status" class="status-pill"&gt;Connecting...&lt;/span&gt;
    &lt;/div&gt;
    &lt;div id="vehicle-list"&gt;&lt;/div&gt;
  &lt;/aside&gt;

  &lt;!-- Map Container --&gt;
  &lt;main id="map-container"&gt;
    &lt;div id="map"&gt;&lt;/div&gt;
    &lt;div id="alert-toast-container"&gt;&lt;/div&gt;
  &lt;/main&gt;

  &lt;!-- Leaflet JS --&gt;
  &lt;script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"&gt;&lt;/script&gt;
  &lt;script&gt;
    const CONFIG = {
      wsBaseUrl: "ws://localhost:3000/ws",
      sessionToken: "PASTE_YOUR_SESSION_JWT_TOKEN_HERE" 
    };

    const state = {
      vehicles: new Map(),
      markers: new Map(),
      trails: new Map(),
      selectedId: null,
      ws: null
    };

    // 1. Initialize Map
    const map = L.map('map').setView([51.5074, -0.1278], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // 2. Custom Marker Generator
    function createMarkerIcon(heading = 0, isLive = true) {
      const headingDeg = heading || 0;
      const html = `
        &lt;div class="marker-dot ${isLive ? '' : 'offline'}"&gt;
          ${isLive ? '&lt;div class="pulse-ring"&gt;&lt;/div&gt;' : ''}
          &lt;div class="arrow" style="transform: rotate(${headingDeg}deg);"&gt;&lt;/div&gt;
        &lt;/div&gt;
      `;
      return L.divIcon({ className: '', html, iconSize: [20, 20], iconAnchor: [10, 10] });
    }

    // 3. Render Vehicle Sidebar
    function renderSidebar() {
      const listEl = document.getElementById('vehicle-list');
      listEl.innerHTML = '';
      state.vehicles.forEach(v => {
        const card = document.createElement('div');
        card.className = `vehicle-card ${state.selectedId === v.id ? 'active' : ''}`;
        const speedKmh = Math.round((v.speedKn || 0) * 1.852);
        card.innerHTML = `
          &lt;div class="vehicle-title"&gt;
            &lt;span&gt;${v.name || 'Vehicle #' + v.id}&lt;/span&gt;
            &lt;span style="color:${v.valid ? '#34d399' : '#f87171'}"&gt;${speedKmh} km/h&lt;/span&gt;
          &lt;/div&gt;
          &lt;div class="vehicle-meta"&gt;
            &lt;span&gt;${v.plate || 'No Plate'}&lt;/span&gt;
            &lt;span&gt;${v.course || 0}° Heading&lt;/span&gt;
          &lt;/div&gt;
        `;
        card.onclick = () => focusVehicle(v.id);
        listEl.appendChild(card);
      });
    }

    // 4. Focus Vehicle
    function focusVehicle(vid) {
      state.selectedId = vid;
      renderSidebar();
      const v = state.vehicles.get(vid);
      if (v && v.lat && v.lon) {
        map.flyTo([v.lat, v.lon], 16, { duration: 1.2 });
        const m = state.markers.get(vid);
        if (m) m.openPopup();
      }
    }

    // 5. Update Position
    function updateVehiclePosition(vid, pos, meta = {}) {
      let v = state.vehicles.get(vid) || { id: vid, ...meta };
      v = { ...v, ...pos };
      state.vehicles.set(vid, v);

      const latLng = [v.lat, v.lon];
      let marker = state.markers.get(vid);

      if (!marker) {
        marker = L.marker(latLng, { icon: createMarkerIcon(v.course, v.valid) }).addTo(map);
        marker.on('click', () => focusVehicle(vid));
        state.markers.set(vid, marker);
      } else {
        marker.setLatLng(latLng);
        marker.setIcon(createMarkerIcon(v.course, v.valid));
      }

      const speedKmh = Math.round((v.speedKn || 0) * 1.852);
      marker.bindPopup(`
        &lt;div style="color:#0f172a; font-family:sans-serif;"&gt;
          &lt;strong style="font-size:1rem;"&gt;${v.name || 'Vehicle #' + vid}&lt;/strong&gt;&lt;br&gt;
          &lt;span style="color:#64748b;"&gt;Plate:&lt;/span&gt; ${v.plate || '—'}&lt;br&gt;
          &lt;span style="color:#64748b;"&gt;Speed:&lt;/span&gt; &lt;strong&gt;${speedKmh} km/h&lt;/strong&gt;&lt;br&gt;
          &lt;span style="color:#64748b;"&gt;Heading:&lt;/span&gt; ${v.course || 0}°&lt;br&gt;
          &lt;span style="color:#64748b;"&gt;Coords:&lt;/span&gt; ${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}
        &lt;/div&gt;
      `);

      let trail = state.trails.get(vid);
      if (!trail) {
        trail = L.polyline([latLng], { className: 'trail-line' }).addTo(map);
        state.trails.set(vid, trail);
      } else {
        trail.addLatLng(latLng);
      }

      renderSidebar();
    }

    // 6. Connect Realtime WebSocket
    function connectStreaming(token) {
      const statusEl = document.getElementById('conn-status');
      const ws = new WebSocket(`${CONFIG.wsBaseUrl}?token=${token}`);

      ws.onopen = () => {
        statusEl.textContent = "Live";
        statusEl.className = "status-pill";
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') {
            msg.positions.forEach(p => {
              updateVehiclePosition(p.vehicle_id, {
                lat: p.lat, lon: p.lon, speedKn: p.speed_kn, course: p.course, valid: p.valid
              });
            });
            const pts = msg.positions.map(p => [p.lat, p.lon]);
            if (pts.length) map.fitBounds(pts, { padding: [50, 50] });
          } else if (msg.type === 'position') {
            updateVehiclePosition(msg.vehicleId, msg.position);
          }
        } catch (e) { console.error("WS Parse error:", e); }
      };

      ws.onclose = () => {
        statusEl.textContent = "Disconnected";
        statusEl.className = "status-pill offline";
        setTimeout(() => connectStreaming(token), 4000);
      };
    }

    connectStreaming(CONFIG.sessionToken);
  &lt;/script&gt;
&lt;/body&gt;
&lt;/html&gt;</code></pre>
            </div>

            <!-- Tab 2: React (TSX / Hooks) -->
            <div class="tab-pane" data-pane="react" style="display:none;">
              <pre><code>import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface VehiclePosition {
  id: number;
  name?: string;
  plate?: string;
  lat: number;
  lon: number;
  speedKn: number;
  course: number;
  valid: boolean;
}

interface FleetLiveMapProps {
  wsUrl: string;       // e.g. "wss://api.yourtrackinghost.com/ws"
  sessionToken: string; // Minted via POST /api/integration/session
}

export const FleetLiveMap: React.FC&lt;FleetLiveMapProps&gt; = ({ wsUrl, sessionToken }) => {
  const mapContainerRef = useRef&lt;HTMLDivElement&gt;(null);
  const mapRef = useRef&lt;L.Map | null&gt;(null);
  const markersRef = useRef&lt;Map&lt;number, L.Marker&gt;&gt;(new Map());
  const trailsRef = useRef&lt;Map&lt;number, L.Polyline&gt;&gt;(new Map());

  const [vehicles, setVehicles] = useState&lt;Map&lt;number, VehiclePosition&gt;&gt;(new Map());
  const [selectedId, setSelectedId] = useState&lt;number | null&gt;(null);
  const [isConnected, setIsConnected] = useState&lt;boolean&gt;(false);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([51.5074, -0.1278], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Custom Marker Icon with Heading Rotation
  const createMarkerIcon = (course = 0, isValid = true) => {
    return L.divIcon({
      className: '',
      html: `
        <div style="width:20px; height:20px; border-radius:50%; background:${isValid ? '#38bdf8' : '#94a3b8'}; border:2px solid #ffffff; position:relative; box-shadow:0 0 10px rgba(56,189,248,0.6);">
          <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-bottom:10px solid #ffffff; position:absolute; top:-14px; left:3px; transform-origin:50% 24px; transform:rotate(${course}deg);"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  };

  // 3. Connect Realtime WebSocket Stream
  useEffect(() => {
    if (!sessionToken) return;

    const ws = new WebSocket(`${wsUrl}?token=${sessionToken}`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'snapshot') {
          setVehicles((prev) => {
            const next = new Map(prev);
            const pts: [number, number][] = [];

            msg.positions.forEach((p: any) => {
              const posData: VehiclePosition = {
                id: p.vehicle_id,
                lat: p.lat,
                lon: p.lon,
                speedKn: p.speed_kn,
                course: p.course,
                valid: p.valid
              };
              next.set(p.vehicle_id, posData);
              pts.push([p.lat, p.lon]);
              updateMarker(p.vehicle_id, posData);
            });

            if (mapRef.current && pts.length) {
              mapRef.current.fitBounds(pts, { padding: [50, 50] });
            }
            return next;
          });
        } else if (msg.type === 'position') {
          const vid = msg.vehicleId;
          const pos = msg.position;
          const posData: VehiclePosition = {
            id: vid,
            lat: pos.lat,
            lon: pos.lon,
            speedKn: pos.speedKn,
            course: pos.course,
            valid: pos.valid
          };

          setVehicles((prev) => {
            const next = new Map(prev);
            next.set(vid, { ...next.get(vid), ...posData });
            return next;
          });

          updateMarker(vid, posData);
        }
      } catch (err) {
        console.error('Error parsing telematics frame:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [wsUrl, sessionToken]);

  // 4. Update Leaflet Marker & Trail Line
  const updateMarker = (vid: number, pos: VehiclePosition) => {
    if (!mapRef.current) return;
    const latLng: [number, number] = [pos.lat, pos.lon];

    let marker = markersRef.current.get(vid);
    if (!marker) {
      marker = L.marker(latLng, { icon: createMarkerIcon(pos.course, pos.valid) }).addTo(mapRef.current);
      marker.on('click', () => handleFocus(vid));
      markersRef.current.set(vid, marker);
    } else {
      marker.setLatLng(latLng);
      marker.setIcon(createMarkerIcon(pos.course, pos.valid));
    }

    const speedKmh = Math.round((pos.speedKn || 0) * 1.852);
    marker.bindPopup(`
      <div style="font-family:sans-serif; color:#0f172a;">
        <strong>Vehicle #${vid}</strong><br/>
        Speed: <strong>${speedKmh} km/h</strong><br/>
        Heading: ${pos.course || 0}°<br/>
        Coords: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}
      </div>
    `);

    let trail = trailsRef.current.get(vid);
    if (!trail) {
      trail = L.polyline([latLng], { color: '#38bdf8', weight: 3, dashArray: '5,5' }).addTo(mapRef.current);
      trailsRef.current.set(vid, trail);
    } else {
      trail.addLatLng(latLng);
    }
  };

  const handleFocus = (vid: number) => {
    setSelectedId(vid);
    const v = vehicles.get(vid);
    if (v && mapRef.current) {
      mapRef.current.flyTo([v.lat, v.lon], 16, { duration: 1.2 });
      const m = markersRef.current.get(vid);
      if (m) m.openPopup();
    }
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', background: '#0f172a', color: '#f8fafc' }}>
      {/* Fleet Sidebar */}
      <aside style={{ width: '320px', background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#38bdf8' }}>ERP Fleet Live Map</h3>
          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px', background: isConnected ? '#065f46' : '#7f1d1d', color: isConnected ? '#34d399' : '#f87171', fontWeight: 600 }}>
            {isConnected ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {Array.from(vehicles.values()).map((v) => {
            const speedKmh = Math.round((v.speedKn || 0) * 1.852);
            return (
              <div
                key={v.id}
                onClick={() => handleFocus(v.id)}
                style={{
                  background: selectedId === v.id ? '#172554' : '#0f172a',
                  border: `1px solid ${selectedId === v.id ? '#38bdf8' : '#334155'}`,
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.9rem' }}>
                  <span>Vehicle #{v.id}</span>
                  <span style={{ color: v.valid ? '#34d399' : '#f87171' }}>{speedKmh} km/h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                  <span>{v.plate || 'No Plate'}</span>
                  <span>{v.course || 0}° Heading</span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Map Viewport */}
      <main style={{ flex: 1, height: '100%', position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </main>
    </div>
  );
};</code></pre>
            </div>

            <!-- Tab 3: Angular (Standalone Component) -->
            <div class="tab-pane" data-pane="angular" style="display:none;">
              <pre><code>import { Component, OnInit, OnDestroy, ElementRef, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

interface VehiclePosition {
  id: number;
  name?: string;
  plate?: string;
  lat: number;
  lon: number;
  speedKn: number;
  course: number;
  valid: boolean;
}

@Component({
  selector: 'app-fleet-live-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3>ERP Fleet Telematics</h3>
          <span class="status-pill" [class.online]="isConnected" [class.offline]="!isConnected">
            {{ isConnected ? 'LIVE' : 'DISCONNECTED' }}
          </span>
        </div>
        <div class="vehicle-list">
          <div 
            *ngFor="let v of vehiclesList" 
            class="vehicle-card" 
            [class.active]="selectedId === v.id"
            (click)="focusVehicle(v.id)">
            <div class="title-row">
              <span>{{ v.name || 'Vehicle #' + v.id }}</span>
              <span [style.color]="v.valid ? '#34d399' : '#f87171'">{{ getKmh(v.speedKn) }} km/h</span>
            </div>
            <div class="meta-row">
              <span>{{ v.plate || 'No Plate' }}</span>
              <span>{{ v.course || 0 }}° Heading</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- Map Container -->
      <main class="map-container">
        <div #mapElement class="map-viewport"></div>
      </main>
    </div>
  `,
  styles: [`
    .map-layout { display: flex; width: 100%; height: 100vh; background: #0f172a; color: #f8fafc; font-family: sans-serif; }
    .sidebar { width: 320px; background: #1e293b; border-right: 1px solid #334155; display: flex; flex-direction: column; }
    .sidebar-header { padding: 16px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .sidebar-header h3 { margin: 0; font-size: 1rem; color: #38bdf8; }
    .status-pill { font-size: 0.7rem; padding: 2px 8px; border-radius: 9999px; font-weight: 600; }
    .status-pill.online { background: #065f46; color: #34d399; }
    .status-pill.offline { background: #7f1d1d; color: #f87171; }
    .vehicle-list { flex: 1; overflow-y: auto; padding: 12px; }
    .vehicle-card { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; }
    .vehicle-card.active, .vehicle-card:hover { border-color: #38bdf8; background: #172554; }
    .title-row { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
    .meta-row { display: flex; justify-content: space-between; font-size: 0.75rem; color: #94a3b8; }
    .map-container { flex: 1; height: 100%; position: relative; }
    .map-viewport { width: 100%; height: 100%; }
  `]
})
export class FleetLiveMapComponent implements OnInit, OnDestroy {
  @Input() wsUrl: string = 'wss://api.yourtrackinghost.com/ws';
  @Input() sessionToken: string = '';

  @ViewChild('mapElement', { static: true }) mapElement!: ElementRef;

  private map!: L.Map;
  private ws!: WebSocket;
  private markers = new Map<number, L.Marker>();
  private trails = new Map<number, L.Polyline>();

  vehicles = new Map<number, VehiclePosition>();
  selectedId: number | null = null;
  isConnected = false;

  get vehiclesList(): VehiclePosition[] {
    return Array.from(this.vehicles.values());
  }

  ngOnInit(): void {
    this.initMap();
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    if (this.ws) this.ws.close();
    if (this.map) this.map.remove();
  }

  getKmh(knots: number): number {
    return Math.round((knots || 0) * 1.852);
  }

  private initMap(): void {
    this.map = L.map(this.mapElement.nativeElement).setView([51.5074, -0.1278], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);
  }

  private createMarkerIcon(course = 0, isValid = true): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `
        <div style="width:20px; height:20px; border-radius:50%; background:${isValid ? '#38bdf8' : '#94a3b8'}; border:2px solid #ffffff; position:relative; box-shadow:0 0 10px rgba(56,189,248,0.6);">
          <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-bottom:10px solid #ffffff; position:absolute; top:-14px; left:3px; transform-origin:50% 24px; transform:rotate(${course}deg);"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  }

  private connectWebSocket(): void {
    if (!this.sessionToken) return;

    this.ws = new WebSocket(`${this.wsUrl}?token=${this.sessionToken}`);

    this.ws.onopen = () => { this.isConnected = true; };
    this.ws.onclose = () => {
      this.isConnected = false;
      setTimeout(() => this.connectWebSocket(), 4000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot') {
          const pts: [number, number][] = [];
          msg.positions.forEach((p: any) => {
            const pos: VehiclePosition = {
              id: p.vehicle_id,
              lat: p.lat,
              lon: p.lon,
              speedKn: p.speed_kn,
              course: p.course,
              valid: p.valid
            };
            this.vehicles.set(p.vehicle_id, pos);
            pts.push([p.lat, p.lon]);
            this.updateMarker(p.vehicle_id, pos);
          });
          if (pts.length) this.map.fitBounds(pts, { padding: [50, 50] });
        } else if (msg.type === 'position') {
          const vid = msg.vehicleId;
          const pos: VehiclePosition = {
            id: vid,
            lat: msg.position.lat,
            lon: msg.position.lon,
            speedKn: msg.position.speedKn,
            course: msg.position.course,
            valid: msg.position.valid
          };
          this.vehicles.set(vid, { ...this.vehicles.get(vid), ...pos });
          this.updateMarker(vid, pos);
        }
      } catch (e) {
        console.error('WebSocket message parsing error:', e);
      }
    };
  }

  private updateMarker(vid: number, pos: VehiclePosition): void {
    const latLng: [number, number] = [pos.lat, pos.lon];
    let marker = this.markers.get(vid);

    if (!marker) {
      marker = L.marker(latLng, { icon: this.createMarkerIcon(pos.course, pos.valid) }).addTo(this.map);
      marker.on('click', () => this.focusVehicle(vid));
      this.markers.set(vid, marker);
    } else {
      marker.setLatLng(latLng);
      marker.setIcon(this.createMarkerIcon(pos.course, pos.valid));
    }

    const speedKmh = this.getKmh(pos.speedKn);
    marker.bindPopup(`
      <div style="font-family:sans-serif; color:#0f172a;">
        <strong>Vehicle #${vid}</strong><br/>
        Speed: <strong>${speedKmh} km/h</strong><br/>
        Heading: ${pos.course || 0}°<br/>
        Coords: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}
      </div>
    `);

    let trail = this.trails.get(vid);
    if (!trail) {
      trail = L.polyline([latLng], { color: '#38bdf8', weight: 3, dashArray: '5,5' }).addTo(this.map);
      this.trails.set(vid, trail);
    } else {
      trail.addLatLng(latLng);
    }
  }

  focusVehicle(vid: number): void {
    this.selectedId = vid;
    const v = this.vehicles.get(vid);
    if (v) {
      this.map.flyTo([v.lat, v.lon], 16, { duration: 1.2 });
      const m = this.markers.get(vid);
      if (m) m.openPopup();
    }
  }
}</code></pre>
            </div>

          </div>
        </div>
      </section>
"""
