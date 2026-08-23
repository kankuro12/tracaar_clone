# -*- coding: utf-8 -*-

SECTIONS_5_TO_7 = """
      <!-- ========================================================================= -->
      <!-- SECTION 5: REAL-TIME WEBSOCKET STREAMING PROTOCOL -->
      <!-- ========================================================================= -->
      <section id="section-websocket" class="doc-section">
        <div class="section-header">
          <span class="section-number">05</span>
          <h2>Real-Time WebSocket Protocol Specification</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">WebSocket Connection Lifecycle</h3>
          <p style="color: var(--text-secondary); margin-bottom: 18px;">
            The platform provides low-latency push delivery over standard RFC 6455 WebSockets. ERP clients connect by appending their signed session token as a URL query parameter:
          </p>

          <div class="code-wrapper">
            <div class="code-header">
              <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">WebSocket Connection URL</span>
            </div>
            <pre><code>wss://api.yourtrackinghost.com/ws?token=&lt;session-jwt-token&gt;</code></pre>
          </div>

          <h4 style="margin: 24px 0 12px; font-size: 1.05rem; color: var(--text-primary);">WebSocket Message Frame Types</h4>

          <!-- Frame 1: Snapshot -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span style="background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); font-weight: 700; font-size: 0.78rem; padding: 2px 8px; border-radius: 4px;">FRAME 1</span>
              <strong style="color: var(--text-primary); font-size: 0.95rem;">Snapshot Frame (Sent Immediately on Connect)</strong>
            </div>
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 12px;">
              Provides the current last-known state of all vehicles whitelisted in the session token. Vehicles that have not yet reported are omitted. Note that raw DB snapshot keys use snake_case.
            </p>
            <pre><code>{
  "type": "snapshot",
  "positions": [
    {
      "vehicle_id": 2,
      "id": 8841,
      "recorded_at": "2026-08-21T10:14:02.123Z",
      "device_time": "2026-08-21T10:13:55.000Z",
      "valid": true,
      "lat": 51.5074,
      "lon": -0.1278,
      "speed_kn": 12.4,
      "course": 90.0
    }
  ]
}</code></pre>
          </div>

          <!-- Frame 2: Position -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span style="background: rgba(16, 185, 129, 0.2); color: var(--accent-green); font-weight: 700; font-size: 0.78rem; padding: 2px 8px; border-radius: 4px;">FRAME 2</span>
              <strong style="color: var(--text-primary); font-size: 0.95rem;">Position Frame (Live GPS Report)</strong>
            </div>
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 12px;">
              Pushed in real time whenever an incoming device datagram is ingested. Position frames use camelCase property formatting.
            </p>
            <pre><code>{
  "type": "position",
  "vehicleId": 2,
  "position": {
    "id": 8842,
    "recordedAt": "2026-08-21T10:14:17.654Z",
    "deviceTime": "2026-08-21T10:14:10.000Z",
    "valid": true,
    "lat": 51.5081,
    "lon": -0.1269,
    "speedKn": 13.7,
    "course": 91.2
  }
}</code></pre>
          </div>

          <!-- Frame 3: Alert -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
              <span style="background: rgba(245, 158, 11, 0.2); color: var(--accent-amber); font-weight: 700; font-size: 0.78rem; padding: 2px 8px; border-radius: 4px;">FRAME 3</span>
              <strong style="color: var(--text-primary); font-size: 0.95rem;">Alert Frame (Geofence / Offline Event)</strong>
            </div>
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin-bottom: 12px;">
              Pushed immediately when a spatial transition or stale timeout occurs. Alert <code>type</code> values: <code>enter</code>, <code>exit</code>, <code>offline</code>, <code>online</code>.
            </p>
            <pre><code>{
  "type": "alert",
  "alert": {
    "id": 77,
    "customer_id": 2,
    "vehicle_id": 2,
    "geofence_id": 5,
    "type": "enter",
    "message": "Van 12 entered Distribution Depot",
    "lat": 51.5074,
    "lon": -0.1278,
    "created_at": "2026-08-21T10:14:17.654Z",
    "resolved_at": null
  }
}</code></pre>
          </div>

          <h4 style="margin: 24px 0 12px; font-size: 1.05rem; color: var(--text-primary);">Telemetry Units & Conversion Reference</h4>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Field</th><th>Units</th><th>Conversion Formula</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>lat</code>, <code>lon</code></td>
                  <td>Decimal Degrees (WGS84)</td>
                  <td><code>lat: ±90.0</code>, <code>lon: ±180.0</code></td>
                  <td>Geodetic coordinates. Negative values indicate South / West hemispheres.</td>
                </tr>
                <tr>
                  <td><code>speedKn</code> / <code>speed_kn</code></td>
                  <td>Knots (Nautical Miles/hr)</td>
                  <td><code>km/h = knots * 1.852</code><br><code>mph = knots * 1.15078</code></td>
                  <td>Instantaneous ground speed calculated by the GPS chip.</td>
                </tr>
                <tr>
                  <td><code>course</code></td>
                  <td>Degrees (0.0° – 360.0°)</td>
                  <td><code>0°=North, 90°=East, 180°=South, 270°=West</code></td>
                  <td>True heading relative to true geographic North.</td>
                </tr>
                <tr>
                  <td><code>valid</code></td>
                  <td>Boolean (<code>true</code> | <code>false</code>)</td>
                  <td><code>true</code> = 3D Fix, <code>false</code> = Fix Lost</td>
                  <td>When <code>false</code>, coordinates represent last known cached position.</td>
                </tr>
                <tr>
                  <td><code>deviceTime</code></td>
                  <td>ISO 8601 UTC</td>
                  <td><code>YYYY-MM-DDTHH:mm:ss.sssZ</code></td>
                  <td>GPS satellite timestamp as reported by the tracker hardware.</td>
                </tr>
                <tr>
                  <td><code>recordedAt</code></td>
                  <td>ISO 8601 UTC</td>
                  <td><code>YYYY-MM-DDTHH:mm:ss.sssZ</code></td>
                  <td>Ingestion timestamp when server received the frame.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 6: WEBHOOKS & NOTIFICATIONS -->
      <!-- ========================================================================= -->
      <section id="section-webhooks" class="doc-section">
        <div class="section-header">
          <span class="section-number">06</span>
          <h2>Webhook & Out-of-Band Notifications</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Automated Event Webhook Delivery</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            In addition to WebSocket streaming, the telematics platform supports direct HTTP POST webhook dispatching to external ERP endpoints whenever geofence transitions or vehicle offline/online events occur.
          </p>

          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; margin-bottom: 20px;">
            <h4 style="color: var(--accent-amber); margin-bottom: 10px; font-size: 0.95rem;">Webhook JSON Payload (HTTP POST)</h4>
            <pre><code>{
  "type": "enter",
  "message": "Van 12 entered Distribution Depot",
  "vehicleId": 2,
  "geofenceId": 5,
  "lat": 51.5074,
  "lon": -0.1278,
  "at": "2026-08-21T10:14:17.654Z"
}</code></pre>
          </div>

          <div class="callout callout-warning">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <div>
              <strong>Webhook Receiver Best Practices:</strong>
              <ul style="padding-left: 18px; margin-top: 4px; font-size: 0.85rem;">
                <li>Return an immediate <code>HTTP 200 OK</code> response within 2,000ms.</li>
                <li>Offload heavy ERP operations (e.g. updating order statuses, triggering customer SMS alerts) to a background worker queue (Celery, Laravel Queue, RabbitMQ).</li>
                <li>Design receiver idempotency using the combination of <code>vehicleId</code>, <code>type</code>, and <code>at</code> timestamp.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 7: HARDWARE & DEVICE INGEST PROTOCOL -->
      <!-- ========================================================================= -->
      <section id="section-hardware" class="doc-section">
        <div class="section-header">
          <span class="section-number">07</span>
          <h2>Sinotrack (H02 Protocol) Telematics Ingest</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Raw TCP Ingest Engine (:9000)</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            Physical tracking units (such as Sinotrack ST-901, ST-902, ST-906) broadcast NMEA ASCII frames over persistent or connectionless TCP connections to port <code>9000</code>.
          </p>

          <div style="background: var(--bg-code); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 18px;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; font-weight: 700;">Raw H02 ASCII Datagram:</div>
            <pre style="padding: 0; background: transparent; color: #38bdf8;"><code>*HQ,867421030123456,V1,101410,A,5130.4440,N,00007.6140,W,013.70,091,210826,FFFFFBFF,234,15,0,0#</code></pre>
          </div>

          <div class="table-container">
            <table>
              <thead>
                <tr><th>Pos</th><th>Raw Value</th><th>Field Name</th><th>Description & Parsing Logic</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td><code>*HQ</code></td><td>Header Marker</td><td>Fixed protocol identifier preamble.</td></tr>
                <tr><td>2</td><td><code>867421030123456</code></td><td>Device IMEI</td><td>8 to 15 digit hardware IMEI identifier. Looked up in memory cache.</td></tr>
                <tr><td>3</td><td><code>V1</code></td><td>Version Code</td><td>Protocol specification level.</td></tr>
                <tr><td>4</td><td><code>101410</code></td><td>Time (HHMMSS)</td><td>10:14:10 UTC satellite time.</td></tr>
                <tr><td>5</td><td><code>A</code></td><td>Fix Validity</td><td><code>A</code> = Valid GPS lock, <code>V</code> = Void / Cell-tower estimate.</td></tr>
                <tr><td>6–7</td><td><code>5130.4440, N</code></td><td>Latitude</td><td><code>51° + (30.4440 / 60)' = 51.5074° N</code></td></tr>
                <tr><td>8–9</td><td><code>00007.6140, W</code></td><td>Longitude</td><td><code>0° + (07.6140 / 60)' = -0.1269° W</code> (Negative sign for W/S)</td></tr>
                <tr><td>10</td><td><code>013.70</code></td><td>Speed (Knots)</td><td>13.70 Knots (~25.37 km/h).</td></tr>
                <tr><td>11</td><td><code>091</code></td><td>Heading</td><td>91° True East heading.</td></tr>
                <tr><td>12</td><td><code>210826</code></td><td>Date (DDMMYY)</td><td>August 21, 2026.</td></tr>
              </tbody>
            </table>
          </div>

          <h4 style="margin: 24px 0 10px; font-size: 1.05rem; color: var(--text-primary);">Offline Stale-Vehicle Detector</h4>
          <p style="font-size: 0.88rem; color: var(--text-secondary);">
            The backend executes an offline evaluation tick every 60 seconds. If a vehicle has not emitted a valid report within <code>OFFLINE_AFTER_MIN</code> (default: 5 minutes), an <code>offline</code> alert is generated and dispatched via WebSocket and Webhook. Once the vehicle resumes transmission, the open offline alert is marked resolved (<code>resolved_at = now()</code>) and an <code>online</code> alert is emitted.
          </p>
        </div>
      </section>
"""
