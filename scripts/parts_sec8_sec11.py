# -*- coding: utf-8 -*-

TEMPLATE_8_TO_11 = """
      <!-- ========================================================================= -->
      <!-- SECTION 8: MULTI-LANGUAGE PRODUCTION SDKs & CODE SNIPPETS -->
      <!-- ========================================================================= -->
      <section id="section-sdks" class="doc-section">
        <div class="section-header">
          <span class="section-number">08</span>
          <h2>Production-Ready Multi-Language Integration SDKs</h2>
        </div>

        <div class="card-box">
          <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Copy-paste production implementations for ingesting live vehicle streams into your ERP background services, database layers, and web controllers.
          </p>

          <!-- Language Tabs Wrapper -->
          <div class="code-wrapper" id="sdk-code-box">
            <div class="code-header">
              <div class="code-tabs">
                <button class="code-tab-btn active" data-tab="php" onclick="selectTab('sdk-code-box', 'php')">PHP / Laravel</button>
                <button class="code-tab-btn" data-tab="python" onclick="selectTab('sdk-code-box', 'python')">Python (AsyncIO)</button>
                <button class="code-tab-btn" data-tab="node" onclick="selectTab('sdk-code-box', 'node')">Node.js / TS</button>
                <button class="code-tab-btn" data-tab="csharp" onclick="selectTab('sdk-code-box', 'csharp')">C# / .NET 8</button>
              </div>
              <button class="copy-btn" onclick="copyCode(this, 'sdk-active-code')">Copy SDK Code</button>
            </div>

            <!-- PHP / Laravel -->
            <div class="tab-pane" data-pane="php" style="display:block;">
              <pre id="sdk-active-code"><code>&lt;?php
namespace App\\Services;

use Illuminate\\Support\\Facades\\Http;
use Illuminate\\Support\\Facades\\Log;
use WebSocket\\Client;

/**
 * Enterprise Fleet Telematics Ingestion Service for Laravel / PHP
 */
class FleetTrackingService
{
    protected string $baseUrl;
    protected string $erpClientId;
    protected string $apiKey;

    public function __construct()
    {
        $this->baseUrl = config('services.telematics.url', 'https://api.yourtrackinghost.com');
        $this->erpClientId = config('services.telematics.client_id', 'odoo-prod');
        $this->apiKey = config('services.telematics.api_key', 'fk_...');
    }

    /**
     * Fetch active vehicle catalog
     */
    public function getVehicles(): array
    {
        $response = Http::withToken($this->apiKey)
            ->get("{$this->baseUrl}/api/integration/vehicles");

        if ($response->failed()) {
            Log::error("Failed to fetch vehicles: " . $response->body());
            throw new \\Exception("Vehicle fetch failed: " . $response->status());
        }

        return $response->json();
    }

    /**
     * Mint a short-lived WebSocket session token
     */
    public function createSession(array $vehicleIds, int $ttlSeconds = 600): array
    {
        $response = Http::post("{$this->baseUrl}/api/integration/session", [
            'erpClientId'          => $this->erpClientId,
            'apiKey'               => $this->apiKey,
            'vehicleIds'           => $vehicleIds,
            'sessionLengthSeconds' => $ttlSeconds,
        ]);

        if ($response->failed()) {
            Log::error("Session creation failed: " . $response->body());
            throw new \\Exception("Session minting error: " . $response->status());
        }

        return $response->json();
    }

    /**
     * Long-running stream worker daemon
     */
    public function runStreamDaemon(array $vehicleIds): void
    {
        while (true) {
            try {
                Log::info("Minting fresh session token for stream daemon...");
                $session = $this->createSession($vehicleIds, 600);
                
                $wsUrl = str_replace(['http://', 'https://'], ['ws://', 'wss://'], $this->baseUrl) 
                       . "/ws?token=" . $session['token'];

                $client = new Client($wsUrl, ['timeout' => 500]);
                Log::info("Connected to live telematics stream.");

                $connectedAt = time();
                // Renew connection at 80% of TTL (480 seconds)
                while (time() - $connectedAt < 480) {
                    $message = $client->receive();
                    if (!$message) continue;

                    $payload = json_decode($message, true);
                    $this->handleFrame($payload);
                }

                $client->close();
            } catch (\\Exception $e) {
                Log::warning("WebSocket stream dropped: " . $e->getMessage() . ". Reconnecting in 5s...");
                sleep(5);
            }
        }
    }

    protected function handleFrame(array $frame): void
    {
        $type = $frame['type'] ?? '';
        if ($type === 'position') {
            $vehicleId = $frame['vehicleId'];
            $pos = $frame['position'];
            Log::debug("Position update: Vehicle #{$vehicleId} @ [{$pos['lat']}, {$pos['lon']}] Speed: {$pos['speedKn']} kn");
            // Update internal ERP database records or broadcast to WebSocket UI
        } elseif ($type === 'alert') {
            $alert = $frame['alert'];
            Log::warning("Fleet Alert: " . $alert['message']);
        } elseif ($type === 'snapshot') {
            Log::info("Snapshot received with " . count($frame['positions']) . " vehicle states.");
        }
    }
}</code></pre>
            </div>

            <!-- Python AsyncIO -->
            <div class="tab-pane" data-pane="python" style="display:none;">
              <pre><code>import asyncio
import json
import logging
import aiohttp
import websockets

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

class FleetTrackingClient:
    def __init__(self, base_url: str, erp_client_id: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.erp_client_id = erp_client_id
        self.api_key = api_key
        self.ws_base = self.base_url.replace('http://', 'ws://').replace('https://', 'wss://')

    async def get_vehicles(self):
        async with aiohttp.ClientSession() as session:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            async with session.get(f"{self.base_url}/api/integration/vehicles", headers=headers) as resp:
                resp.raise_for_status()
                return await resp.json()

    async def mint_session(self, vehicle_ids: list, ttl_seconds: int = 600) -> dict:
        async with aiohttp.ClientSession() as session:
            payload = {
                "erpClientId": self.erp_client_id,
                "apiKey": self.api_key,
                "vehicleIds": vehicle_ids,
                "sessionLengthSeconds": ttl_seconds
            }
            async with session.post(f"{self.base_url}/api/integration/session", json=payload) as resp:
                resp.raise_for_status()
                return await resp.json()

    async def stream_live_telematics(self, vehicle_ids: list):
        while True:
            try:
                logging.info("Minting integration session token...")
                session_data = await self.mint_session(vehicle_ids, ttl_seconds=600)
                token = session_data["token"]
                ws_url = f"{self.ws_base}/ws?token={token}"

                logging.info(f"Connecting to WebSocket: {ws_url[:45]}...")
                async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                    logging.info("WebSocket connected successfully!")
                    
                    start_time = asyncio.get_event_loop().time()
                    # Run until 80% of TTL expires (480s)
                    while (asyncio.get_event_loop().time() - start_time) < 480:
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=30.0)
                            data = json.loads(msg)
                            self.on_message(data)
                        except asyncio.TimeoutError:
                            # Keepalive check
                            pass
                            
            except Exception as e:
                logging.error(f"Stream error: {e}. Reconnecting in 5 seconds...")
                await asyncio.sleep(5)

    def on_message(self, data: dict):
        msg_type = data.get("type")
        if msg_type == "position":
            vid = data["vehicleId"]
            pos = data["position"]
            logging.info(f"Vehicle #{vid} => Lat: {pos['lat']:.5f}, Lon: {pos['lon']:.5f}, Speed: {pos['speedKn']} kn, Course: {pos['course']}°")
        elif msg_type == "alert":
            alert = data["alert"]
            logging.warning(f"ALERT [{alert['type'].upper()}]: {alert['message']}")
        elif msg_type == "snapshot":
            logging.info(f"SNAPSHOT: Received initial states for {len(data.get('positions', []))} vehicles.")

if __name__ == "__main__":
    client = FleetTrackingClient("https://map.needtechnosoft.com", "odoo-prod", "fk_7a2b9c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7")
    asyncio.run(client.stream_live_telematics([2, 3, 4]))</code></pre>
            </div>

            <!-- Node.js / TypeScript -->
            <div class="tab-pane" data-pane="node" style="display:none;">
              <pre><code>import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface TelematicsPosition {
  id: number;
  recordedAt: string;
  deviceTime: string;
  valid: boolean;
  lat: number;
  lon: number;
  speedKn: number;
  course: number;
}

export class FleetTrackingClient extends EventEmitter {
  private baseUrl: string;
  private wsUrl: string;
  private erpClientId: string;
  private apiKey: string;
  private ws: WebSocket | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(baseUrl: string, erpClientId: string, apiKey: string) {
    super();
    this.baseUrl = baseUrl.replace(/\\/$/, '');
    this.wsUrl = this.baseUrl.replace(/^http/, 'ws');
    this.erpClientId = erpClientId;
    this.apiKey = apiKey;
  }

  async getVehicles(): Promise&lt;any[]&gt; {
    const res = await fetch(`${this.baseUrl}/api/integration/vehicles`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    if (!res.ok) throw new Error(`Fetch vehicles failed: ${res.statusText}`);
    return res.json();
  }

  async createSession(vehicleIds: number[], ttlSeconds = 600): Promise&lt;string&gt; {
    const res = await fetch(`${this.baseUrl}/api/integration/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        erpClientId: this.erpClientId,
        apiKey: this.apiKey,
        vehicleIds,
        sessionLengthSeconds: ttlSeconds
      })
    });
    if (!res.ok) throw new Error(`Mint session failed: ${await res.text()}`);
    const data = await res.json();
    return data.token;
  }

  async startStreaming(vehicleIds: number[]) {
    try {
      const token = await this.createSession(vehicleIds, 600);
      this.ws = new WebSocket(`${this.wsUrl}/ws?token=${token}`);

      this.ws.on('open', () => {
        this.emit('connected');
        // Proactively refresh connection after 480s (80% of TTL)
        this.refreshTimer = setTimeout(() => {
          this.ws?.close();
          this.startStreaming(vehicleIds);
        }, 480 * 1000);
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'position') this.emit('position', msg.vehicleId, msg.position);
          else if (msg.type === 'alert') this.emit('alert', msg.alert);
          else if (msg.type === 'snapshot') this.emit('snapshot', msg.positions);
        } catch (e) {
          this.emit('error', e);
        }
      });

      this.ws.on('close', (code) => {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.emit('disconnected', code);
        // Automatic reconnect on unexpected drop
        setTimeout(() => this.startStreaming(vehicleIds), 5000);
      });

      this.ws.on('error', (err) => this.emit('error', err));
    } catch (err) {
      this.emit('error', err);
      setTimeout(() => this.startStreaming(vehicleIds), 5000);
    }
  }
}</code></pre>
            </div>

            <!-- C# / .NET 8 -->
            <div class="tab-pane" data-pane="csharp" style="display:none;">
              <pre><code>using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

public class FleetTrackingWorker : BackgroundService
{
    private readonly ILogger&lt;FleetTrackingWorker&gt; _logger;
    private readonly HttpClient _http;
    private readonly string _baseUrl = "https://api.yourtrackinghost.com";
    private readonly string _erpClientId = "dotnet-erp-prod";
    private readonly string _apiKey = "fk_...";

    public FleetTrackingWorker(ILogger&lt;FleetTrackingWorker&gt; logger, HttpClient http)
    {
        _logger = logger;
        _http = http;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        int[] vehicleIds = new[] { 2, 3, 4 };

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _logger.LogInformation("Minting session JWT token...");
                var sessionReq = new
                {
                    erpClientId = _erpClientId,
                    apiKey = _apiKey,
                    vehicleIds = vehicleIds,
                    sessionLengthSeconds = 600
                };

                var resp = await _http.PostAsJsonAsync($"{_baseUrl}/api/integration/session", sessionReq, stoppingToken);
                resp.EnsureSuccessStatusCode();
                var doc = await resp.Content.ReadFromJsonAsync&lt;JsonElement&gt;(cancellationToken: stoppingToken);
                string token = doc.GetProperty("token").GetString();

                string wsUrl = _baseUrl.Replace("http://", "ws://").Replace("https://", "wss://") + $"/ws?token={token}";
                using var ws = new ClientWebSocket();
                await ws.ConnectAsync(new Uri(wsUrl), stoppingToken);
                _logger.LogInformation("WebSocket connected to live telematics stream.");

                var buffer = new byte[4096];
                var startTime = DateTime.UtcNow;

                while (ws.State == WebSocketState.Open && (DateTime.UtcNow - startTime).TotalSeconds < 480)
                {
                    var result = await ws.ReceiveAsync(new ArraySegment&lt;byte&gt;(buffer), stoppingToken);
                    if (result.MessageType == WebSocketMessageType.Close) break;

                    string json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    using var frameDoc = JsonDocument.Parse(json);
                    string type = frameDoc.RootElement.GetProperty("type").GetString();

                    if (type == "position")
                    {
                        int vid = frameDoc.RootElement.GetProperty("vehicleId").GetInt32();
                        var pos = frameDoc.RootElement.GetProperty("position");
                        double lat = pos.GetProperty("lat").GetDouble();
                        double lon = pos.GetProperty("lon").GetDouble();
                        double speed = pos.GetProperty("speedKn").GetDouble();
                        _logger.LogInformation("Vehicle {Vid}: ({Lat}, {Lon}) at {Speed} knots", vid, lat, lon, speed);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Stream error. Reconnecting in 5 seconds...");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }
}</code></pre>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 9: DATABASE SCHEMA & POSTGIS REFERENCE -->
      <!-- ========================================================================= -->
      <section id="section-schema" class="doc-section">
        <div class="section-header">
          <span class="section-number">09</span>
          <h2>Database Schema & PostGIS Spatial Reference</h2>
        </div>

        <div class="card-box">
          <h3 style="margin-bottom: 12px; font-size: 1.2rem; color: var(--text-primary);">Relational Data Model & PostGIS Extensions</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            The underlying database is PostgreSQL with the <code>postgis</code> extension enabled. Spatial points are generated dynamically from coordinates using <code>ST_MakePoint(lon, lat)</code> with SRID 4326.
          </p>

          <div class="code-wrapper">
            <div class="code-header">
              <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">PostgreSQL Schema (Core Entities)</span>
            </div>
            <pre><code>-- Spatial Geometries & Telematics Tables
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE customers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  plan_id    BIGINT REFERENCES plans(id),
  alert_email TEXT,
  alert_webhook TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  imei        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  plate       TEXT NOT NULL DEFAULT '',
  dest_lat    DOUBLE PRECISION,
  dest_lon    DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_imei ON vehicles (imei);

CREATE TABLE positions (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_time TIMESTAMPTZ NOT NULL,
  valid       BOOLEAN NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  point       geography(Point,4326) GENERATED ALWAYS AS
                (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED,
  speed_kn    DOUBLE PRECISION NOT NULL DEFAULT 0,
  course      DOUBLE PRECISION NOT NULL DEFAULT 0,
  raw_frame   TEXT NOT NULL
);
CREATE INDEX idx_positions_vehicle_devicetime ON positions (vehicle_id, device_time DESC);

CREATE TABLE geofences (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  center      geography(Point,4326) NOT NULL,
  radius_m    DOUBLE PRECISION NOT NULL CHECK (radius_m > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE integration_keys (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  client_id   TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);</code></pre>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 10: SCREENSHOT GALLERY & UI VIEWS -->
      <!-- ========================================================================= -->
      <section id="section-gallery" class="doc-section">
        <div class="section-header">
          <span class="section-number">10</span>
          <h2>Platform UI & Screenshot Gallery</h2>
        </div>

        <div class="card-box">
          <p style="color: var(--text-secondary); margin-bottom: 20px;">
            Click any screenshot to expand in high resolution and inspect live telematics indicators, trail replay lines, and multi-tenant management portals.
          </p>

          <div class="gallery-grid">
            <!-- 1. Live Dashboard -->
            <div class="gallery-card" onclick="openLightbox('{{IMG_DASH1}}', 'Live Fleet Telematics & Map Dashboard')">
              <div class="gallery-img-wrap">
                <img src="{{IMG_DASH1}}" alt="Live Fleet Dashboard">
              </div>
              <div class="gallery-caption">
                <h4>Live Map Dashboard</h4>
                <p>Real-time vehicle markers, heading rotation, speed badges, and active state panel.</p>
              </div>
            </div>

            <!-- 2. Historical Trail -->
            <div class="gallery-card" onclick="openLightbox('{{IMG_TRAIL}}', 'Historical Movement Trail & Route Replay')">
              <div class="gallery-img-wrap">
                <img src="{{IMG_TRAIL}}" alt="Movement Trail">
              </div>
              <div class="gallery-caption">
                <h4>Route Replay & Movement Trail</h4>
                <p>Temporal breadcrumbs connecting GPS points for route adherence analysis.</p>
              </div>
            </div>

            <!-- 3. Super Admin Dashboard -->
            <div class="gallery-card" onclick="openLightbox('{{IMG_SUPER_DASH}}', 'Super Admin Multi-Tenant Fleet Overview')">
              <div class="gallery-img-wrap">
                <img src="{{IMG_SUPER_DASH}}" alt="Super Admin Dashboard">
              </div>
              <div class="gallery-caption">
                <h4>Multi-Tenant Overview</h4>
                <p>Global fleet oversight across all provisioned client companies and tenancies.</p>
              </div>
            </div>

            <!-- 4. User Workspace -->
            <div class="gallery-card" onclick="openLightbox('{{IMG_USER_DASH}}', 'Restricted Driver / Dispatcher Workspace')">
              <div class="gallery-img-wrap">
                <img src="{{IMG_USER_DASH}}" alt="User Workspace">
              </div>
              <div class="gallery-caption">
                <h4>Restricted User Workspace</h4>
                <p>Scoped dispatcher view displaying strictly assigned vehicles and routes.</p>
              </div>
            </div>

            <!-- 5. Tenant Management -->
            <div class="gallery-card" onclick="openLightbox('{{IMG_SUPER_CUST}}', 'Tenant Onboarding & Plan Management')">
              <div class="gallery-img-wrap">
                <img src="{{IMG_SUPER_CUST}}" alt="Tenant Management">
              </div>
              <div class="gallery-caption">
                <h4>Tenant & Billing Portal</h4>
                <p>Customer onboarding, webhook URLs, plan limits, and invoice tracking.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- SECTION 11: TROUBLESHOOTING & FAQ -->
      <!-- ========================================================================= -->
      <section id="section-troubleshooting" class="doc-section">
        <div class="section-header">
          <span class="section-number">11</span>
          <h2>Troubleshooting, Error Reference & FAQ</h2>
        </div>

        <div class="card-box">
          <h4 style="margin-bottom: 14px; font-size: 1.05rem; color: var(--text-primary);">Frequently Encountered Integration Questions</h4>

          <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);">
            <h5 style="color: var(--accent-cyan); font-size: 0.95rem; margin-bottom: 6px;">Q: Why did my WebSocket connection close with code 4001?</h5>
            <p style="font-size: 0.86rem; color: var(--text-secondary);">
              Close code <code>4001 (Unauthorized)</code> indicates that the session token in the <code>?token=</code> query parameter was omitted, malformed, or expired. Remember that session JWTs have an expiration timestamp (e.g. 300s or 600s). Re-mint a fresh token via <code>POST /api/integration/session</code> and reconnect.
            </p>
          </div>

          <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);">
            <h5 style="color: var(--accent-cyan); font-size: 0.95rem; margin-bottom: 6px;">Q: Can our ERP send a subscribe frame after connecting?</h5>
            <p style="font-size: 0.86rem; color: var(--text-secondary);">
              No. Integration sockets are bound strictly to the vehicle IDs cryptographically embedded in the session token during minting. Any <code>subscribe</code> or <code>unsubscribe</code> messages sent over integration sockets are ignored by design to prevent privilege escalation.
            </p>
          </div>

          <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);">
            <h5 style="color: var(--accent-cyan); font-size: 0.95rem; margin-bottom: 6px;">Q: What is the maximum number of vehicles per WebSocket session?</h5>
            <p style="font-size: 0.86rem; color: var(--text-secondary);">
              A single session token can whitelist up to <strong>500 vehicles</strong>. If your fleet exceeds 500 units, partition your fleet into multiple concurrent sessions (e.g. grouped by region or vehicle type) across separate socket connections.
            </p>
          </div>

          <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);">
            <h5 style="color: var(--accent-cyan); font-size: 0.95rem; margin-bottom: 6px;">Q: How do we convert speed values to km/h and mph?</h5>
            <p style="font-size: 0.86rem; color: var(--text-secondary);">
              The raw GPS chip outputs speed in international nautical knots. Multiply by <code>1.852</code> to convert to kilometers per hour (<code>km/h = knots * 1.852</code>), or multiply by <code>1.15078</code> for miles per hour (<code>mph = knots * 1.15078</code>).
            </p>
          </div>

          <div style="margin-bottom: 10px;">
            <h5 style="color: var(--accent-cyan); font-size: 0.95rem; margin-bottom: 6px;">Q: How does the system handle vehicle reconnects after tunnel loss?</h5>
            <p style="font-size: 0.86rem; color: var(--text-secondary);">
              When a vehicle moves through a tunnel, cellular or GPS signal may drop. The device will mark <code>valid: false</code> on un-fixed frames. Once GPS lock is restored, the next valid frame updates coordinates and automatically resolves any open <code>offline</code> alert by emitting an <code>online</code> alert frame.
            </p>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer style="margin-top: 60px; padding-top: 24px; border-top: 1px solid var(--border-color); text-align: center; color: var(--text-muted); font-size: 0.82rem;">
        <p>Fleet Telematics Enterprise ERP Integration Documentation &bull; Protocol Version 1.0.0 &bull; Built for High-Availability Telematics Ingestion</p>
      </footer>

    </div> <!-- End content-body -->
  </main>
"""

def build_sections_8_to_11(img_dash1, img_trail, img_super_dash, img_user_dash, img_super_cust):
    return (TEMPLATE_8_TO_11
        .replace("{{IMG_DASH1}}", img_dash1)
        .replace("{{IMG_TRAIL}}", img_trail)
        .replace("{{IMG_SUPER_DASH}}", img_super_dash)
        .replace("{{IMG_USER_DASH}}", img_user_dash)
        .replace("{{IMG_SUPER_CUST}}", img_super_cust))
