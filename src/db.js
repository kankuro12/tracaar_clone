require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getVehicleByImei(imei) {
  const r = await pool.query('SELECT id, customer_id, imei, name, plate FROM vehicles WHERE imei = $1', [imei]);
  return r.rows[0] || null;
}

async function insertPosition({ vehicleId, valid, lat, lon, speedKn, course, deviceTime, raw }) {
  const r = await pool.query(
    `INSERT INTO positions (vehicle_id, valid, lat, lon, speed_kn, course, device_time, raw_frame)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, recorded_at, device_time, valid, lat, lon, speed_kn, course`,
    [vehicleId, valid, lat, lon, speedKn, course, deviceTime, raw]
  );
  return r.rows[0];
}

// Which vehicle ids may `user` see. role super_admin -> everything.
// NOTE: pg returns BIGINT columns as strings and INT4 as numbers — normalize to
// String so Set.has() matches what ingest passes (hub.publish keys by vehicle.id).
async function visibleVehicleIds(user) {
  if (user.role === 'super_admin') {
    const r = await pool.query('SELECT id FROM vehicles');
    return new Set(r.rows.map((x) => String(x.id)));
  }
  if (user.role === 'admin') {
    const r = await pool.query('SELECT id FROM vehicles WHERE customer_id = $1', [user.customerId]);
    return new Set(r.rows.map((x) => String(x.id)));
  }
  const r = await pool.query(
    `SELECT vehicle_id FROM vehicle_user WHERE user_id = $1`,
    [user.id]
  );
  return new Set(r.rows.map((x) => String(x.vehicle_id)));
}

async function canSeeVehicle(user, vehicleId) {
  return (await visibleVehicleIds(user)).has(String(vehicleId));
}

// One row per visible vehicle incl. latest position (null when never reported).
async function latestPositions(user) {
  const scope = user.role === 'super_admin'
    ? { sql: '', params: [] }
    : user.role === 'admin'
      ? { sql: 'WHERE v.customer_id = $1', params: [user.customerId] }
      : {
          sql: `WHERE v.id IN (SELECT vehicle_id FROM vehicle_user WHERE user_id = $1)`,
          params: [user.id],
        };
  const r = await pool.query(
    `SELECT DISTINCT ON (v.id)
       v.id, v.name, v.plate, v.imei, v.dest_lat, v.dest_lon,
       p.id AS position_id, p.recorded_at, p.device_time, p.valid, p.lat, p.lon, p.speed_kn, p.course
     FROM vehicles v
     LEFT JOIN positions p ON p.vehicle_id = v.id
     ${scope.sql}
     ORDER BY v.id, p.recorded_at DESC`,
    scope.params
  );
  return r.rows;
}

async function positionHistory(user, vehicleId, from, to) {
  if (!(await canSeeVehicle(user, vehicleId))) return null;
  const r = await pool.query(
    `SELECT id, recorded_at, device_time, valid, lat, lon, speed_kn, course
     FROM positions
     WHERE vehicle_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
     ORDER BY recorded_at ASC`,
    [vehicleId, from, to]
  );
  return r.rows;
}

// If this vehicle had an open offline alert, resolve it and return a fresh
// 'online' alert (null when the vehicle wasn't flagged).
async function resolveOfflineAlert(vehicle) {
  const open = await pool.query(
    `SELECT id FROM alerts WHERE vehicle_id = $1 AND type = 'offline' AND resolved_at IS NULL ORDER BY id LIMIT 1`,
    [vehicle.id]
  );
  if (!open.rows.length) return null;
  await pool.query('UPDATE alerts SET resolved_at = now() WHERE id = $1', [open.rows[0].id]);
  const r = await pool.query(
    `INSERT INTO alerts (customer_id, vehicle_id, geofence_id, type, message)
     VALUES ($1, $2, NULL, 'online', $3) RETURNING *`,
    [vehicle.customer_id, vehicle.id, `${vehicle.name} back online`]
  );
  return r.rows[0];
}

async function createAlert({ customerId, vehicleId, geofenceId, type, message, lat, lon }) {
  const r = await pool.query(
    `INSERT INTO alerts (customer_id, vehicle_id, geofence_id, type, message, lat, lon)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [customerId, vehicleId, geofenceId, type, message, lat, lon]
  );
  return r.rows[0];
}

module.exports = { pool, getVehicleByImei, insertPosition, visibleVehicleIds, canSeeVehicle, latestPositions, positionHistory, resolveOfflineAlert, createAlert };
