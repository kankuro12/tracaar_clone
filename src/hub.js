const { WebSocketServer } = require('ws');
const { verify } = require('./auth');
const { visibleVehicleIds, canSeeVehicle, pool } = require('./db');

// Realtime hub. Client -> server: {type:'subscribe'|'unsubscribe', vehicleId}
// Server -> client: {type:'position', vehicleId, position} | {type:'alert', alert}
//
// Two kinds of client:
//  - dashboard users: role admin/super_admin auto-subscribed to tenant fleet;
//    'user' role subscribes explicitly per vehicle (visibility checked).
//  - ERP integration sessions: token embeds an exact vehicle-id list, no
//    subscribe messages honored — they only ever receive that list.
//
// publish() is keyed by vehicle id (Map<vehicleId, Set<client>>) instead of
// scanning every connected socket per position, so it stays cheap as the
// number of connected dashboards grows.
const ADMIN_RESYNC_MS = 30_000; // pick up newly-added vehicles without a reconnect

class Hub {
  constructor() {
    this.sockets = new Set(); // { ws, user, subs:Set<vehicleId>, integration:bool }
    this.byVehicle = new Map(); // vehicleId -> Set<client>
  }

  _index(client, vehicleId) {
    let set = this.byVehicle.get(vehicleId);
    if (!set) this.byVehicle.set(vehicleId, (set = new Set()));
    set.add(client);
  }

  _unindex(client, vehicleId) {
    const set = this.byVehicle.get(vehicleId);
    if (!set) return;
    set.delete(client);
    if (!set.size) this.byVehicle.delete(vehicleId);
  }

  _setSubs(client, nextSubs) {
    for (const vid of client.subs) if (!nextSubs.has(vid)) this._unindex(client, vid);
    for (const vid of nextSubs) if (!client.subs.has(vid)) this._index(client, vid);
    client.subs = nextSubs;
  }

  attach(httpServer) {
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', async (ws, req) => {
      const token = new URL(req.url, 'http://x').searchParams.get('token');
      let user;
      try { user = verify(token); } catch { ws.close(4001, 'unauthorized'); return; }
      ws.on('error', () => {});
      const client = { ws, user, subs: new Set() };
      this.sockets.add(client);

      if (user.kind === 'integration') {
        client.integration = true;
        this._setSubs(client, new Set(user.vehicleIds || []));
        // snapshot so the ERP has current state immediately
        try {
          const r = await pool.query(
            `SELECT DISTINCT ON (v.id) v.id AS vehicle_id,
                    p.id, p.recorded_at, p.device_time, p.valid, p.lat, p.lon, p.speed_kn, p.course
             FROM vehicles v
             JOIN positions p ON p.vehicle_id = v.id
             WHERE v.id = ANY($1::bigint[])
             ORDER BY v.id, p.device_time DESC`,
            [client.subs.size ? [...client.subs] : [0]]
          );
          ws.send(JSON.stringify({ type: 'snapshot', positions: r.rows }));
        } catch { /* snapshot best-effort */ }
      } else {
        // Admin / super admin: auto-subscribe to every tenant vehicle (spec 7).
        // Re-synced periodically below so a vehicle added mid-session shows up
        // without the dashboard having to reconnect.
        if (user.role === 'admin' || user.role === 'super_admin') {
          this._setSubs(client, await visibleVehicleIds(user));
        }
        ws.on('message', async (raw) => {
          let msg;
          try { msg = JSON.parse(raw); } catch { return; }
          const vid = msg && msg.vehicleId;
          if (!msg || !vid || !/^\d+$/.test(String(vid))) return;
          if (!(await canSeeVehicle(user, +vid))) return; // no relaxing access on rt channel
          const key = String(vid);
          if (msg.type === 'subscribe' && !client.subs.has(key)) {
            client.subs.add(key);
            this._index(client, key);
          } else if (msg.type === 'unsubscribe' && client.subs.has(key)) {
            client.subs.delete(key);
            this._unindex(client, key);
          }
        });
      }

      ws.on('close', () => {
        this.sockets.delete(client);
        for (const vid of client.subs) this._unindex(client, vid);
      });
    });

    setInterval(() => this._resyncAdmins().catch(() => {}), ADMIN_RESYNC_MS).unref();
  }

  async _resyncAdmins() {
    for (const client of this.sockets) {
      if (client.integration) continue;
      if (client.user.role !== 'admin' && client.user.role !== 'super_admin') continue;
      const fresh = await visibleVehicleIds(client.user);
      this._setSubs(client, fresh);
    }
  }

  publish(vehicleId, payload) {
    const set = this.byVehicle.get(String(vehicleId));
    if (!set || !set.size) return;
    const data = JSON.stringify(payload);
    for (const c of set) {
      try { c.ws.send(data); } catch { /* socket dead, cleaned up on close */ }
    }
  }
}

module.exports = Hub;
