# -*- coding: utf-8 -*-

SECTIONS_1_TO_3 = """
      <!-- ========================================================================= -->
      <!-- SECTION 1: ARCHITECTURE & SYSTEM OVERVIEW -->
      <!-- ========================================================================= -->
      <section id="section-overview" class="doc-section">
        <div class="section-header">
          <span class="section-number">01</span>
          <h2>System Architecture & Integration Topology</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Enterprise Platform Architecture</h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">
            The Fleet Telematics System is a cloud-native, multi-tenant live GPS tracking platform engineered for high-throughput telematics ingestion, spatial boundary processing, and real-time state synchronization. External ERP systems integrate across three distinct data planes:
          </p>

          <!-- SVG Architecture Diagram -->
          <div style="background: var(--bg-code); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 24px; margin: 24px 0; overflow-x: auto; text-align: center;">
            <svg viewBox="0 0 960 400" width="100%" height="100%" style="max-width: 920px; font-family: 'Inter', sans-serif;">
              <defs>
                <linearGradient id="gradBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.2"/>
                  <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.05"/>
                </linearGradient>
                <linearGradient id="gradCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.2"/>
                  <stop offset="100%" stop-color="#0891b2" stop-opacity="0.05"/>
                </linearGradient>
                <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#10b981" stop-opacity="0.2"/>
                  <stop offset="100%" stop-color="#047857" stop-opacity="0.05"/>
                </linearGradient>
                <linearGradient id="gradPurple" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.2"/>
                  <stop offset="100%" stop-color="#6d28d9" stop-opacity="0.05"/>
                </linearGradient>
              </defs>

              <!-- Trackers Box -->
              <rect x="20" y="140" width="150" height="120" rx="12" fill="url(#gradCyan)" stroke="#06b6d4" stroke-width="1.5"/>
              <text x="95" y="180" fill="#22d3ee" font-size="14" font-weight="700" text-anchor="middle">GPS Trackers</text>
              <text x="95" y="202" fill="#9ca3af" font-size="11" text-anchor="middle">Sinotrack / H02</text>
              <text x="95" y="222" fill="#67e8f9" font-size="10" font-family="'JetBrains Mono'" text-anchor="middle">TCP Port :9000</text>

              <!-- Ingest Arrow -->
              <path d="M 170 200 L 240 200" stroke="#06b6d4" stroke-width="2" stroke-dasharray="4,4" marker-end="url(#arrow)"/>
              <text x="205" y="190" fill="#9ca3af" font-size="10" text-anchor="middle">Raw TCP</text>

              <!-- Core Backend -->
              <rect x="240" y="40" width="440" height="320" rx="16" fill="url(#gradBlue)" stroke="#3b82f6" stroke-width="1.5"/>
              <text x="460" y="70" fill="#60a5fa" font-size="16" font-weight="700" text-anchor="middle">Fleet Telematics Core Server</text>

              <!-- TCP Ingest Service -->
              <rect x="260" y="90" width="180" height="60" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1"/>
              <text x="350" y="118" fill="#f8fafc" font-size="12" font-weight="600" text-anchor="middle">TCP Ingest Listener</text>
              <text x="350" y="136" fill="#94a3b8" font-size="10" text-anchor="middle">IMEI Cache & NMEA Parser</text>

              <!-- Realtime Hub Service -->
              <rect x="260" y="170" width="180" height="60" rx="8" fill="#1e293b" stroke="#06b6d4" stroke-width="1"/>
              <text x="350" y="198" fill="#38bdf8" font-size="12" font-weight="600" text-anchor="middle">Realtime WebSocket Hub</text>
              <text x="350" y="216" fill="#94a3b8" font-size="10" text-anchor="middle">RFC 6455 Multiplexer (/ws)</text>

              <!-- REST API & Webhooks -->
              <rect x="260" y="250" width="180" height="85" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="1"/>
              <text x="350" y="276" fill="#60a5fa" font-size="12" font-weight="600" text-anchor="middle">REST & Webhook Emitter</text>
              <text x="350" y="294" fill="#94a3b8" font-size="10" text-anchor="middle">Auth, Keys, Routes, Geofences</text>
              <text x="350" y="312" fill="#fbbf24" font-size="10" text-anchor="middle">Offline Watcher (60s tick)</text>

              <!-- PostGIS DB -->
              <rect x="480" y="100" width="180" height="220" rx="10" fill="#0f172a" stroke="#10b981" stroke-width="1.5"/>
              <text x="570" y="130" fill="#34d399" font-size="13" font-weight="700" text-anchor="middle">PostgreSQL + PostGIS</text>
              <text x="570" y="152" fill="#94a3b8" font-size="10" text-anchor="middle">Spatial Point Geography</text>
              <line x1="495" y1="165" x2="645" y2="165" stroke="#334155" stroke-width="1"/>
              <text x="505" y="188" fill="#cbd5e1" font-size="10">▪ positions (ST_Point)</text>
              <text x="505" y="210" fill="#cbd5e1" font-size="10">▪ geofences (ST_DWithin)</text>
              <text x="505" y="232" fill="#cbd5e1" font-size="10">▪ vehicles (IMEI / plates)</text>
              <text x="505" y="254" fill="#cbd5e1" font-size="10">▪ integration_keys (hash)</text>
              <text x="505" y="276" fill="#cbd5e1" font-size="10">▪ alerts & invoices</text>

              <!-- Connections between internal blocks -->
              <path d="M 440 120 L 480 140" stroke="#10b981" stroke-width="1.5"/>
              <path d="M 440 200 L 480 200" stroke="#06b6d4" stroke-width="1.5"/>
              <path d="M 440 280 L 480 260" stroke="#3b82f6" stroke-width="1.5"/>

              <!-- Out to ERP -->
              <rect x="760" y="70" width="180" height="260" rx="12" fill="url(#gradPurple)" stroke="#8b5cf6" stroke-width="1.5"/>
              <text x="850" y="105" fill="#c084fc" font-size="14" font-weight="700" text-anchor="middle">Enterprise ERP / WMS</text>
              <text x="850" y="125" fill="#9ca3af" font-size="10" text-anchor="middle">Odoo / SAP / Dynamics / Custom</text>
              <line x1="775" y1="140" x2="925" y2="140" stroke="#4c1d95" stroke-width="1"/>
              <text x="785" y="165" fill="#e9d5ff" font-size="11">1. Live Location Sync</text>
              <text x="785" y="195" fill="#e9d5ff" font-size="11">2. ETA & Route Replay</text>
              <text x="785" y="225" fill="#e9d5ff" font-size="11">3. Geofence Boundary</text>
              <text x="785" y="255" fill="#e9d5ff" font-size="11">4. Driver / Asset Map</text>
              <text x="785" y="285" fill="#e9d5ff" font-size="11">5. Automated Invoicing</text>

              <!-- Connect Core to ERP -->
              <!-- Live WS Line -->
              <path d="M 440 190 C 580 190, 640 170, 760 170" stroke="#06b6d4" stroke-width="2" fill="none"/>
              <text x="700" y="160" fill="#22d3ee" font-size="10" font-weight="600" text-anchor="middle">WebSocket Stream</text>

              <!-- REST Line -->
              <path d="M 440 270 C 580 270, 640 240, 760 240" stroke="#3b82f6" stroke-width="2" fill="none"/>
              <text x="700" y="230" fill="#60a5fa" font-size="10" font-weight="600" text-anchor="middle">REST APIs (JSON)</text>

              <!-- Webhook Line -->
              <path d="M 440 310 C 580 310, 640 300, 760 300" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,3" fill="none"/>
              <text x="700" y="325" fill="#fbbf24" font-size="10" font-weight="600" text-anchor="middle">Webhooks (HTTP POST)</text>
            </svg>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 24px;">
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px;">
              <h4 style="color: var(--accent-cyan); margin-bottom: 6px; font-size: 0.95rem;">1. Ingestion Engine (:9000 TCP)</h4>
              <p style="font-size: 0.84rem; color: var(--text-secondary);">
                Asynchronously parses Sinotrack H02 ASCII datagrams. Employs in-memory negative-hit IMEI caching for sub-millisecond lookups, rejecting unauthorized devices before touching the database.
              </p>
            </div>
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px;">
              <h4 style="color: var(--accent-blue); margin-bottom: 6px; font-size: 0.95rem;">2. Spatial & Geofence Engine</h4>
              <p style="font-size: 0.84rem; color: var(--text-secondary);">
                Built on PostgreSQL with PostGIS geography point geometry. Computes geodetic distances on WGS84 ellipsoids (<code>ST_DWithin</code>) to trigger atomic <code>enter</code> and <code>exit</code> transitions.
              </p>
            </div>
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px;">
              <h4 style="color: var(--accent-purple); margin-bottom: 6px; font-size: 0.95rem;">3. ERP Stream Multiplexer</h4>
              <p style="font-size: 0.84rem; color: var(--text-secondary);">
                Stateless, cryptographically bounded WebSocket channel. Enforces tenant boundaries via signed session JWT tokens embedding whitelisted vehicle IDs.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 2: 5-MINUTE QUICKSTART -->
      <!-- ========================================================================= -->
      <section id="section-quickstart" class="doc-section">
        <div class="section-header">
          <span class="section-number">02</span>
          <h2>5-Minute ERP Integration Quickstart</h2>
        </div>

        <div class="card-box">
          <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Follow this streamlined 5-step implementation lifecycle to register your ERP client, discover vehicles, mint a session token, and stream live telematics updates.
          </p>

          <!-- Step 1 -->
          <div style="margin-bottom: 28px; padding-left: 20px; border-left: 2px solid var(--accent-blue);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="background: var(--accent-blue); color: #fff; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">1</span>
              <h4 style="font-size: 1.05rem; color: var(--text-primary);">Self-Register or Rotate API Key</h4>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">
              The ERP registers itself using the customer admin's dashboard credentials. Re-calling this endpoint with the same <code>erpClientId</code> instantly rotates the key and invalidates the previous one.
            </p>
            
            <div class="code-wrapper" id="qs-step1-code">
              <div class="code-header">
                <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">POST /api/integration/register</span>
                <button class="copy-btn" onclick="copyCode(this, 'qs-s1-raw')">Copy Request</button>
              </div>
              <pre id="qs-s1-raw"><code>curl -X POST https://api.yourtrackinghost.com/api/integration/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "erpClientId": "odoo-production",
    "email": "admin@acme-logistics.com",
    "password": "CustomerAdminPassword123!"
  }'</code></pre>
            </div>

            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 16px; margin-top: 10px;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-green);">HTTP 201 CREATED RESPONSE:</span>
              <pre style="padding: 6px 0 0; background: transparent; font-size: 0.82rem; color: #a7f3d0;"><code>{
  "customerId": 2,
  "erpClientId": "odoo-production",
  "apiKey": "fk_9d4e5f6a7b8c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c"
}</code></pre>
            </div>
          </div>

          <!-- Step 2 -->
          <div style="margin-bottom: 28px; padding-left: 20px; border-left: 2px solid var(--accent-cyan);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="background: var(--accent-cyan); color: #000; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">2</span>
              <h4 style="font-size: 1.05rem; color: var(--text-primary);">Retrieve Vehicle Catalog & Map Internal IDs</h4>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">
              Query the customer's fleet directory to match ERP delivery vehicles against system tracking IDs and device IMEIs.
            </p>
            
            <div class="code-wrapper" id="qs-step2-code">
              <div class="code-header">
                <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">GET /api/integration/vehicles</span>
                <button class="copy-btn" onclick="copyCode(this, 'qs-s2-raw')">Copy Request</button>
              </div>
              <pre id="qs-s2-raw"><code>curl -X GET https://api.yourtrackinghost.com/api/integration/vehicles \\
  -H "Authorization: Bearer fk_9d4e5f6a7b8c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c"</code></pre>
            </div>

            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 16px; margin-top: 10px;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-green);">HTTP 200 OK RESPONSE:</span>
              <pre style="padding: 6px 0 0; background: transparent; font-size: 0.82rem; color: #a7f3d0;"><code>[
  { "id": 2, "name": "Van 12 - North Delivery", "plate": "BK-4412", "imei": "867421030123456" },
  { "id": 3, "name": "Van 04 - Express Hub", "plate": "BK-4401", "imei": "867421030123457" },
  { "id": 4, "name": "Heavy Truck 02", "plate": "TL-8821", "imei": "867421030123458" }
]</code></pre>
            </div>
          </div>

          <!-- Step 3 -->
          <div style="margin-bottom: 28px; padding-left: 20px; border-left: 2px solid var(--accent-amber);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="background: var(--accent-amber); color: #000; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">3</span>
              <h4 style="font-size: 1.05rem; color: var(--text-primary);">Mint Short-Lived WebSocket Session Token</h4>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">
              Mint a scoped session token embedding the specific array of vehicle IDs to track. You can specify a custom TTL (30s to 86,400s).
            </p>
            
            <div class="code-wrapper" id="qs-step3-code">
              <div class="code-header">
                <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">POST /api/integration/session</span>
                <button class="copy-btn" onclick="copyCode(this, 'qs-s3-raw')">Copy Request</button>
              </div>
              <pre id="qs-s3-raw"><code>curl -X POST https://api.yourtrackinghost.com/api/integration/session \\
  -H "Content-Type: application/json" \\
  -d '{
    "erpClientId": "odoo-production",
    "apiKey": "fk_9d4e5f6a7b8c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c",
    "vehicleIds": [2, 3, 4],
    "sessionLengthSeconds": 600
  }'</code></pre>
            </div>

            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 16px; margin-top: 10px;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-green);">HTTP 200 OK RESPONSE:</span>
              <pre style="padding: 6px 0 0; background: transparent; font-size: 0.82rem; color: #a7f3d0;"><code>{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraW5kIjoiaW50ZWdyYXRpb24iLCJjaWQiOjIsInZpZHMiOlsyLDMsNF0sImlhdCI6MTcyNDIxODAwMCwiZXhwIjoxNzI0MjE4NjAwfQ.xyz...",
  "vehicleIds": [2, 3, 4],
  "expiresIn": 600,
  "expiresAt": "2026-08-21T10:30:00.000Z",
  "wsUrl": "/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}</code></pre>
            </div>
          </div>

          <!-- Step 4 -->
          <div style="padding-left: 20px; border-left: 2px solid var(--accent-purple);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="background: var(--accent-purple); color: #fff; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">4</span>
              <h4 style="font-size: 1.05rem; color: var(--text-primary);">Connect WebSocket & Stream Real-Time Frames</h4>
            </div>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 12px;">
              Open a persistent WebSocket connection to <code>wss://api.yourtrackinghost.com/ws?token=&lt;token&gt;</code>. Receive an immediate initial <code>snapshot</code> frame, followed by live <code>position</code> and <code>alert</code> pushes.
            </p>
            
            <div class="callout callout-info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              <div>
                <strong>Proactive Reconnect Strategy:</strong> The session JWT is single-purpose and stateless. To maintain seamless 24/7 streaming without disconnect gaps, schedule a background timer to mint a new token at 80% TTL elapsed (e.g. at 480 seconds for a 600s token) and gracefully reconnect.
              </div>
            </div>
          </div>

        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 3: AUTHENTICATION & SECURITY MODEL -->
      <!-- ========================================================================= -->
      <section id="section-auth" class="doc-section">
        <div class="section-header">
          <span class="section-number">03</span>
          <h2>Authentication & Security Architecture</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Two-Tier Security Architecture</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            The platform combines long-lived tenant API keys with short-lived cryptographically signed session JWT tokens to guarantee isolation and zero trust on WebSocket channels.
          </p>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Credential Type</th>
                  <th>Format / Pattern</th>
                  <th>Storage / Cryptography</th>
                  <th>Lifecycle / Expiration</th>
                  <th>Scope & Boundary</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Integration API Key</strong></td>
                  <td><code>fk_&lt;48 hex chars&gt;</code></td>
                  <td>One-way SHA-256 hash in <code>integration_keys</code></td>
                  <td>Persistent until revoked or auto-rotated</td>
                  <td>Bound to customer tenant & <code>client_id</code></td>
                </tr>
                <tr>
                  <td><strong>Session JWT Token</strong></td>
                  <td>Stateless HMAC-SHA256 JWT</td>
                  <td>Signed with server <code>JWT_SECRET</code></td>
                  <td>Configurable TTL (30s – 86,400s)</td>
                  <td>Whitelist array of vehicle IDs (<code>vids</code>)</td>
                </tr>
                <tr>
                  <td><strong>User Dashboard JWT</strong></td>
                  <td>Stateless HMAC-SHA256 JWT</td>
                  <td>Signed with server <code>JWT_SECRET</code></td>
                  <td>7 Days (<code>expiresIn: '7d'</code>)</td>
                  <td>User role (<code>super_admin</code>, <code>admin</code>, <code>user</code>)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 style="margin: 24px 0 10px; font-size: 1.05rem; color: var(--text-primary);">HTTP Status Codes & Security Errors</h4>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Status Code</th>
                  <th>Error Payload</th>
                  <th>Root Cause & Mitigation</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code style="color: var(--accent-rose);">400 Bad Request</code></td>
                  <td><code>{"error":"vehicleIds required"}</code></td>
                  <td>Request body omitted the <code>vehicleIds</code> array or passed an empty list. Max limit is 500 IDs per request.</td>
                </tr>
                <tr>
                  <td><code style="color: var(--accent-rose);">401 Unauthorized</code></td>
                  <td><code>{"error":"invalid or revoked integration key"}</code></td>
                  <td>Supplied API key is invalid, improperly formatted, or has been revoked in the database.</td>
                </tr>
                <tr>
                  <td><code style="color: var(--accent-rose);">401 Unauthorized</code></td>
                  <td><code>{"error":"invalid admin credentials"}</code></td>
                  <td>On <code>/api/integration/register</code>, the supplied email or password does not match a tenant admin user.</td>
                </tr>
                <tr>
                  <td><code style="color: var(--accent-rose);">403 Forbidden</code></td>
                  <td><code>{"error":"erpClientId does not match integration key"}</code></td>
                  <td>The <code>erpClientId</code> passed in the session request does not match the bound <code>client_id</code> of the API key.</td>
                </tr>
                <tr>
                  <td><code style="color: var(--accent-rose);">403 Forbidden</code></td>
                  <td><code>{"error":"no allowed vehicles"}</code></td>
                  <td>None of the requested vehicle IDs belong to the customer tenant associated with this API key.</td>
                </tr>
                <tr>
                  <td><code style="color: var(--accent-rose);">4001 WS Close</code></td>
                  <td>WebSocket Close Code <code>4001</code></td>
                  <td>WebSocket connection attempted with a missing, malformed, or expired session JWT token.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
"""
