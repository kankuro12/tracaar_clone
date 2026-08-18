// Geofence enter/exit detection against a freshly stored position.
// Previous position compared so transitions fire exactly once.

async function checkGeofences(vehicleId, lat, lon, positionId) {
  const { pool } = require('./db');
  const r = await pool.query(
    `WITH cur AS (
       SELECT ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography AS p
     ),
     prev AS (
       SELECT lat, lon FROM positions
       WHERE vehicle_id = $1 AND id < $4
       ORDER BY id DESC LIMIT 1
     )
     SELECT g.id, g.name, g.customer_id,
            ST_DWithin(c.p, g.center, g.radius_m) AS inside,
            CASE WHEN pv.lat IS NULL THEN NULL
                 ELSE ST_DWithin(ST_SetSRID(ST_MakePoint(pv.lon, pv.lat), 4326)::geography,
                                 g.center, g.radius_m)
            END AS was_inside
     FROM geofences g
     JOIN vehicle_geofence vg ON vg.geofence_id = g.id
     CROSS JOIN cur c
     LEFT JOIN prev pv ON TRUE
     WHERE vg.vehicle_id = $1`,
    [vehicleId, lon, lat, positionId]
  );
  const events = [];
  for (const g of r.rows) {
    if (g.inside && g.was_inside === false) events.push({ ...g, type: 'enter' });
    else if (!g.inside && g.was_inside === true) events.push({ ...g, type: 'exit' });
  }
  return events;
}

module.exports = { checkGeofences };
