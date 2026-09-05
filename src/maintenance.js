// Service reminders. A maintenance row is due when its date has arrived or
// when the vehicle has covered its due_km since the reminder was created —
// distance comes from the same PostGIS path used by the reports, so no
// odometer hardware is required.
//
// Fires one alert per reminder (notified_at guards repeats) and leaves the row
// open until someone marks it complete.

const { pool } = require('./db');
const { notifyAlert } = require('./notify');

const CHECK_INTERVAL_MS = 6 * 3600 * 1000; // four times a day is plenty

async function distanceSinceKm(vehicleId, since) {
  const r = await pool.query(
    `WITH pts AS (
       SELECT ST_Distance(point, LAG(point) OVER (ORDER BY device_time)) AS d
         FROM positions
        WHERE vehicle_id = $1 AND device_time >= $2 AND valid
     )
     SELECT COALESCE(SUM(d),0) / 1000.0 AS km FROM pts`,
    [vehicleId, since]
  );
  return Number(r.rows[0].km) || 0;
}

async function tick({ hub, log = console.log } = {}) {
  const open = await pool.query(
    `SELECT m.id, m.customer_id, m.vehicle_id, m.title, m.due_date, m.due_km, m.created_at,
            v.name AS vehicle_name
       FROM maintenance m
       JOIN vehicles v ON v.id = m.vehicle_id
      WHERE m.completed_at IS NULL AND m.notified_at IS NULL`
  );

  for (const m of open.rows) {
    let due = false;
    let reason = '';

    if (m.due_date && new Date(m.due_date) <= new Date()) {
      due = true;
      reason = `due ${new Date(m.due_date).toISOString().slice(0, 10)}`;
    }

    if (!due && m.due_km) {
      const km = await distanceSinceKm(m.vehicle_id, m.created_at);
      if (km >= Number(m.due_km)) {
        due = true;
        reason = `${Math.round(km)} km driven (due at ${Math.round(m.due_km)} km)`;
      }
    }

    if (!due) continue;

    const alert = await pool.query(
      `INSERT INTO alerts (customer_id, vehicle_id, geofence_id, type, message)
       VALUES ($1,$2,NULL,'maintenance',$3) RETURNING *`,
      [m.customer_id, m.vehicle_id, `${m.vehicle_name}: ${m.title} — ${reason}`]
    ).then((r) => r.rows[0]);

    await pool.query('UPDATE maintenance SET notified_at = now() WHERE id = $1', [m.id]);
    if (hub) hub.publish(m.vehicle_id, { type: 'alert', alert });
    notifyAlert(alert, null).catch(() => {});
    log(`maintenance: ${m.vehicle_name} — ${m.title} (${reason})`);
  }
}

function startMaintenanceWatcher({ hub, log = console.log } = {}) {
  const fn = () => tick({ hub, log }).catch((e) => log(`maintenance: ${e.message}`));
  fn();
  setInterval(fn, CHECK_INTERVAL_MS).unref();
}

module.exports = { startMaintenanceWatcher, tick, distanceSinceKm };
