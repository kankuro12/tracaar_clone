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
class Hub {
  constructor() {
    this.sockets = new Set(); // { ws, user, subs:Set<vehicleId>, integration:bool }
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
        client.subs = new Set(user.vehicleIds || []);
        // snapshot so the ERP has current state immediately
        try {
          const r = await pool.query(
            `SELECT DISTINCT ON (v.id) v.id AS vehicle_id,
                    p.id, p.recorded_at, p.device_time, p.valid, p.lat, p.lon, p.speed_kn, p.course
             FROM vehicles v
             JOIN positions p ON p.vehicle_id = v.id
             WHERE v.id = ANY($1::bigint[])
             ORDER BY v.id, p.recorded_at DESC`,
            [client.subs.size ? [...client.subs] : [0]]
          );
          ws.send(JSON.stringify({ type: 'snapshot', positions: r.rows }));
        } catch { /* snapshot best-effort */ }
      } else {
        // Admin / super admin: auto-subscribe to every tenant vehicle (spec 7).
        if (user.role === 'admin' || user.role === 'super_admin') {
          client.subs = await visibleVehicleIds(user);
        }
        ws.on('message', async (raw) => {
          let msg;
          try { msg = JSON.parse(raw); } catch { return; }
          const vid = msg && msg.vehicleId;
          if (!msg || !vid || !/^\d+$/.test(String(vid))) return;
          if (!(await canSeeVehicle(user, +vid))) return; // no relaxing access on rt channel
          if (msg.type === 'subscribe') client.subs.add(String(vid));
          else if (msg.type === 'unsubscribe') client.subs.delete(String(vid));
        });
      }

      ws.on('close', () => this.sockets.delete(client));
    });
  }

  publish(vehicleId, payload) {
    const data = JSON.stringify(payload);
    const key = String(vehicleId);
    for (const c of this.sockets) {
      if (c.subs.has(key)) {
        try { c.ws.send(data); } catch { /* socket dead, cleaned up on close */ }
      }
    }
  }
}

module.exports = Hub;
