// Stale-vehicle watcher: emits an 'offline' alert once per vehicle until it
// reports again (ingest resolves it and emits 'online'). Checks every 60s.
// ponytail: naive 60s scan, fine at this fleet size; per-vehicle timers if scale matters.

const { pool } = require('./db');
const { notifyAlert } = require('./notify');

const OFFLINE_AFTER_MIN = +process.env.OFFLINE_AFTER_MIN || 5;

async function tick({ hub, log }) {
  const r = await pool.query(
    `SELECT v.id AS vehicle_id, v.name, v.customer_id, p.recorded_at
     FROM vehicles v
     JOIN LATERAL (
       SELECT recorded_at FROM positions p WHERE p.vehicle_id = v.id
       ORDER BY p.recorded_at DESC LIMIT 1
     ) p ON TRUE
     WHERE p.recorded_at < now() - make_interval(mins => $1)
       AND NOT EXISTS (
         SELECT 1 FROM alerts a
         WHERE a.vehicle_id = v.id AND a.type = 'offline' AND a.resolved_at IS NULL
       )`,
    [OFFLINE_AFTER_MIN]
  );
  for (const row of r.rows) {
    const alert = await pool.query(
      `INSERT INTO alerts (customer_id, vehicle_id, geofence_id, type, message, lat, lon)
       VALUES ($1, $2, NULL, 'offline', $3, $4, $5)
       RETURNING *`,
      [row.customer_id, row.vehicle_id, `${row.name} offline — no report for ${OFFLINE_AFTER_MIN} min`, null, null]
    ).then((x) => x.rows[0]);
    hub.publish(row.vehicle_id, { type: 'alert', alert });
    notifyAlert(alert, null).catch(() => {});
    log(`offline: ${row.name} (${row.vehicle_id})`);
  }
}

function startOfflineWatcher({ hub, log = console.log }) {
  const fn = () => tick({ hub, log }).catch((e) => log(`offline watcher: ${e.message}`));
  fn();
  setInterval(fn, 60_000);
}

module.exports = { startOfflineWatcher, OFFLINE_AFTER_MIN };
