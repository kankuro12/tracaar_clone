# -*- coding: utf-8 -*-

SECTION_REST_API = """
      <!-- ========================================================================= -->
      <!-- SECTION 4: COMPLETE REST API SPECIFICATION -->
      <!-- ========================================================================= -->
      <section id="section-rest-api" class="doc-section">
        <div class="section-header">
          <span class="section-number">04</span>
          <h2>Complete REST API Specification</h2>
        </div>

        <p style="color: var(--text-secondary); margin-bottom: 24px;">
          All REST API endpoints accept and return JSON payloads (<code>Content-Type: application/json</code>). Cross-Origin Resource Sharing (CORS) is enabled platform-wide with permissive headers (<code>*</code>) for cross-domain server and worker communication.
        </p>

        <!-- 4.1 Integration Register -->
        <div class="endpoint-card" id="api-register">
          <div class="endpoint-header">
            <span class="method-pill method-post">POST</span>
            <span class="endpoint-path">/api/integration/register</span>
            <span class="auth-badge">Unauthenticated (Admin Creds in Body)</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Self-service registration endpoint for 3rd-party ERP systems. Authenticates using tenant administrator email and password to issue or rotate an integration API key. If the <code>erpClientId</code> already exists, its API key hash is updated, immediately revoking any previous key.
            </p>

            <h5 style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text-primary); text-transform: uppercase;">Request Body (JSON)</h5>
            <div class="table-container">
              <table>
                <thead>
                  <tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>erpClientId</code></td><td>String</td><td>Yes</td><td>Unique identifier for the ERP installation (e.g. <code>"odoo-prod-east"</code>, <code>"sap-wms-01"</code>).</td></tr>
                  <tr><td><code>email</code></td><td>String</td><td>Yes</td><td>Email address of an active tenant administrator with role <code>admin</code>.</td></tr>
                  <tr><td><code>password</code></td><td>String</td><td>Yes</td><td>Plaintext password for the administrator account.</td></tr>
                </tbody>
              </table>
            </div>

            <div class="code-wrapper" id="ep-reg-code">
              <div class="code-header">
                <div class="code-tabs">
                  <button class="code-tab-btn active" data-tab="curl" onclick="selectTab('ep-reg-code', 'curl')">cURL</button>
                  <button class="code-tab-btn" data-tab="json-res" onclick="selectTab('ep-reg-code', 'json-res')">Response (201)</button>
                </div>
                <button class="copy-btn" onclick="copyCode(this, 'ep-reg-curl')">Copy</button>
              </div>
              <div class="tab-pane" data-pane="curl" style="display:block;">
                <pre id="ep-reg-curl"><code>curl -X POST https://api.yourtrackinghost.com/api/integration/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "erpClientId": "odoo-main",
    "email": "roshan@test.com",
    "password": "roshan123"
  }'</code></pre>
              </div>
              <div class="tab-pane" data-pane="json-res" style="display:none;">
                <pre><code>HTTP/1.1 201 Created
Content-Type: application/json

{
  "customerId": 2,
  "erpClientId": "odoo-main",
  "apiKey": "fk_7a2b9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7"
}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- 4.2 Integration Session -->
        <div class="endpoint-card" id="api-session">
          <div class="endpoint-header">
            <span class="method-pill method-post">POST</span>
            <span class="endpoint-path">/api/integration/session</span>
            <span class="auth-badge">API Key (Header or Body)</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Mints a short-lived, signed JWT session token authorized strictly for a whitelisted set of vehicle IDs. Supports two credential styles: standard Bearer token in the <code>Authorization</code> header, or direct <code>apiKey</code> in the JSON body.
            </p>

            <h5 style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text-primary); text-transform: uppercase;">Request Body (JSON)</h5>
            <div class="table-container">
              <table>
                <thead>
                  <tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>erpClientId</code> / <code>clientId</code></td><td>String</td><td>Yes</td><td>Must match the client ID bound to the integration key.</td></tr>
                  <tr><td><code>apiKey</code></td><td>String</td><td>Conditional</td><td>Required if not sending <code>Authorization: Bearer fk_...</code> header.</td></tr>
                  <tr><td><code>vehicleIds</code></td><td>Array&lt;Integer&gt;</td><td>Yes</td><td>List of vehicle IDs to track (max 500 IDs per session).</td></tr>
                  <tr><td><code>sessionLengthSeconds</code> / <code>ttlSeconds</code></td><td>Integer</td><td>No</td><td>Session duration in seconds (min 30, max 86400, default 300).</td></tr>
                </tbody>
              </table>
            </div>

            <div class="code-wrapper" id="ep-sess-code">
              <div class="code-header">
                <div class="code-tabs">
                  <button class="code-tab-btn active" data-tab="curl" onclick="selectTab('ep-sess-code', 'curl')">cURL (Body Style)</button>
                  <button class="code-tab-btn" data-tab="curl-hdr" onclick="selectTab('ep-sess-code', 'curl-hdr')">cURL (Header Style)</button>
                  <button class="code-tab-btn" data-tab="json-res" onclick="selectTab('ep-sess-code', 'json-res')">Response (200)</button>
                </div>
                <button class="copy-btn" onclick="copyCode(this, 'ep-sess-curl')">Copy</button>
              </div>
              <div class="tab-pane" data-pane="curl" style="display:block;">
                <pre id="ep-sess-curl"><code>curl -X POST https://api.yourtrackinghost.com/api/integration/session \\
  -H "Content-Type: application/json" \\
  -d '{
    "erpClientId": "odoo-main",
    "apiKey": "fk_7a2b9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7",
    "vehicleIds": [2, 3, 4],
    "sessionLengthSeconds": 600
  }'</code></pre>
              </div>
              <div class="tab-pane" data-pane="curl-hdr" style="display:none;">
                <pre><code>curl -X POST https://api.yourtrackinghost.com/api/integration/session \\
  -H "Authorization: Bearer fk_7a2b9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7" \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientId": "odoo-main",
    "vehicleIds": [2, 3, 4],
    "ttlSeconds": 600
  }'</code></pre>
              </div>
              <div class="tab-pane" data-pane="json-res" style="display:none;">
                <pre><code>HTTP/1.1 200 OK
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "vehicleIds": [2, 3, 4],
  "expiresIn": 600,
  "expiresAt": "2026-08-21T10:45:00.000Z",
  "wsUrl": "/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- 4.3 Integration Vehicles -->
        <div class="endpoint-card" id="api-int-vehicles">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="endpoint-path">/api/integration/vehicles</span>
            <span class="auth-badge">Bearer fk_... or x-api-key</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Lists all vehicles belonging to the customer tenant associated with the API key. Used by ERP synchronization jobs to map internal fleet assets to tracking IDs and device IMEIs.
            </p>

            <div class="code-wrapper" id="ep-veh-code">
              <div class="code-header">
                <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">GET /api/integration/vehicles</span>
                <button class="copy-btn" onclick="copyCode(this, 'ep-veh-curl')">Copy</button>
              </div>
              <pre id="ep-veh-curl"><code>curl -X GET https://api.yourtrackinghost.com/api/integration/vehicles \\
  -H "Authorization: Bearer fk_7a2b9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7"</code></pre>
            </div>

            <pre><code>HTTP/1.1 200 OK
Content-Type: application/json

[
  { "id": 2, "name": "Van 12", "plate": "BK-4412", "imei": "867421030123456" },
  { "id": 3, "name": "Van 04", "plate": "BK-4401", "imei": "867421030123457" },
  { "id": 4, "name": "Truck 2", "plate": "TL-8821", "imei": "867421030123458" }
]</code></pre>
          </div>
        </div>

        <!-- 4.4 Keys Management -->
        <div class="endpoint-card" id="api-int-keys">
          <div class="endpoint-header">
            <span class="method-pill method-post">POST</span>
            <span class="method-pill method-get" style="margin-left:-6px;">GET</span>
            <span class="endpoint-path">/api/integration/keys &nbsp;|&nbsp; /:id/revoke</span>
            <span class="auth-badge">Bearer Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Administrative management endpoints for creating, inspecting, and revoking API keys from the web dashboard or management scripts.
            </p>
            <ul style="padding-left: 20px; font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 14px;">
              <li><code>POST /api/integration/keys</code>: Creates key with <code>{"name":"...", "clientId":"..."}</code>. Returns <code>key</code> once.</li>
              <li><code>GET /api/integration/keys</code>: Returns active and revoked keys with creation and revocation timestamps.</li>
              <li><code>POST /api/integration/keys/:id/revoke</code>: Revokes key instantly (HTTP 204 No Content).</li>
            </ul>
          </div>
        </div>

        <!-- 4.5 Fleet & Telematics Management -->
        <div class="endpoint-card" id="api-vehicles-telemetry">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="method-pill method-post" style="margin-left:-6px;">POST</span>
            <span class="endpoint-path">/api/vehicles</span>
            <span class="auth-badge">Bearer User / Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Lists vehicles accessible to the authenticated identity, including their most recent telemetry report and any target destination coordinates.
            </p>
            <div class="code-wrapper">
              <pre><code>HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": 2,
    "name": "Van 12",
    "plate": "BK-4412",
    "imei": "867421030123456",
    "destination": { "lat": 51.5150, "lon": -0.1410 },
    "position": {
      "id": 8842,
      "recordedAt": "2026-08-21T10:15:30.123Z",
      "deviceTime": "2026-08-21T10:15:22.000Z",
      "valid": true,
      "lat": 51.5074,
      "lon": -0.1278,
      "speedKn": 14.2,
      "course": 88.5
    }
  }
]</code></pre>
            </div>
          </div>
        </div>

        <!-- 4.6 Position History (Playback) -->
        <div class="endpoint-card" id="api-history">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="endpoint-path">/api/vehicles/:id/positions</span>
            <span class="auth-badge">Bearer User / Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Retrieves historical GPS trail records for route playback, speed profiling, and delivery compliance auditing.
            </p>
            <h5 style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text-primary); text-transform: uppercase;">Query Parameters</h5>
            <div class="table-container">
              <table>
                <thead>
                  <tr><th>Parameter</th><th>Type</th><th>Default</th><th>Description</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>from</code></td><td>ISO Date / Epoch ms</td><td>Now - 6 hours</td><td>Start of temporal window.</td></tr>
                  <tr><td><code>to</code></td><td>ISO Date / Epoch ms</td><td>Now</td><td>End of temporal window (max 30 days range).</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 4.7 Destination ETA Target -->
        <div class="endpoint-card" id="api-destination">
          <div class="endpoint-header">
            <span class="method-pill method-patch">PATCH</span>
            <span class="endpoint-path">/api/vehicles/:id/destination</span>
            <span class="auth-badge">Bearer Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Assigns or clears navigation destination coordinates for a vehicle. Used by dispatch ERPs to broadcast dynamic drop-off targets.
            </p>
            <pre><code>// Set Destination:
PATCH /api/vehicles/2/destination
{ "lat": 51.5150, "lon": -0.1410 } -> HTTP 204 No Content

// Clear Destination:
PATCH /api/vehicles/2/destination
{ "clear": true } -> HTTP 204 No Content</code></pre>
          </div>
        </div>

        <!-- 4.8 Route Optimization (TSP) -->
        <div class="endpoint-card" id="api-routes-opt">
          <div class="endpoint-header">
            <span class="method-pill method-post">POST</span>
            <span class="endpoint-path">/api/routes/optimize</span>
            <span class="auth-badge">Bearer User / Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Solves the Traveling Salesperson Problem (TSP) using greedy nearest-neighbor Haversine geodesics. Takes 2 to 50 waypoint coordinates and returns the optimized sequence index array and total kilometers.
            </p>
            <div class="code-wrapper">
              <pre><code>POST /api/routes/optimize
{
  "waypoints": [
    [51.5074, -0.1278],
    [51.5200, -0.1000],
    [51.5100, -0.1500]
  ]
}

HTTP/1.1 200 OK
{
  "order": [0, 2, 1],
  "totalKm": 6.8,
  "points": [
    [51.5074, -0.1278],
    [51.5100, -0.1500],
    [51.5200, -0.1000]
  ]
}</code></pre>
            </div>
          </div>
        </div>

        <!-- 4.9 Geofencing Endpoints -->
        <div class="endpoint-card" id="api-geofences">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="method-pill method-post" style="margin-left:-6px;">POST</span>
            <span class="endpoint-path">/api/geofences &nbsp;|&nbsp; /:id/assign</span>
            <span class="auth-badge">Bearer Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Manages circular spatial geofences (center WGS84 point + radius in meters) and assigns vehicles to active monitoring zones.
            </p>
            <ul style="padding-left: 20px; font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 14px;">
              <li><code>GET /api/geofences</code>: Lists all tenant geofences with center <code>lat</code>, <code>lon</code>, <code>radius_m</code>, and <code>vehicleIds</code>.</li>
              <li><code>POST /api/geofences</code>: Creates geofence with <code>{"name":"Warehouse Zone", "lat":51.5074, "lon":-0.1278, "radiusM":500, "vehicleIds":[2,3]}</code>.</li>
              <li><code>POST /api/geofences/:id/assign</code> & <code>DELETE /api/geofences/:id/assign</code>: Links or unlinks vehicle with <code>{"vehicleId": 2}</code>.</li>
            </ul>
          </div>
        </div>

        <!-- 4.10 Alerts -->
        <div class="endpoint-card" id="api-alerts">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="endpoint-path">/api/alerts</span>
            <span class="auth-badge">Bearer User / Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Queries historical security and spatial boundary events (<code>enter</code>, <code>exit</code>, <code>offline</code>, <code>online</code>) for the authenticated tenant. Supports <code>limit</code> query parameter (max 200).
            </p>
          </div>
        </div>

        <!-- 4.11 Users & RBAC -->
        <div class="endpoint-card" id="api-users">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="method-pill method-post" style="margin-left:-6px;">POST</span>
            <span class="endpoint-path">/api/users &nbsp;|&nbsp; /api/vehicles/:id/assign</span>
            <span class="auth-badge">Bearer Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Enables tenant administrators to provision standard driver/viewer accounts and grant granular vehicle visibility permissions.
            </p>
          </div>
        </div>

        <!-- 4.12 Invoices & Plans -->
        <div class="endpoint-card" id="api-invoices">
          <div class="endpoint-header">
            <span class="method-pill method-get">GET</span>
            <span class="method-pill method-post" style="margin-left:-6px;">POST</span>
            <span class="endpoint-path">/api/invoices &nbsp;|&nbsp; /api/invoices/:id/pay</span>
            <span class="auth-badge">Bearer Admin / Super Admin JWT</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">
              Exposes automated billing records generated by the periodic invoice scheduler (every 12 hours). Enables ERP accounting reconciliation and status updates.
            </p>
          </div>
        </div>

      </section>
"""
