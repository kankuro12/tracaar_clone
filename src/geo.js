// Geofence enter/exit detection against a freshly stored position.
// Previous position is passed in by the caller (ingest keeps the vehicle's
// last known fix in memory) instead of being re-queried from positions on
// every single incoming frame.

// Pure decision: was_inside is null when there's no known previous fix (cold
// start) — never fires a transition, since "entered" implies a known outside.
function classifyTransition(inside, wasInside) {
  if (inside && wasInside === false) return 'enter';
  if (!inside && wasInside === true) return 'exit';
  return null;
}

async function checkGeofences(vehicleId, lat, lon, prev) {
  const { pool } = require('./db');
  const r = await pool.query(
    `WITH cur AS (
       SELECT ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography AS p
     )
     SELECT g.id, g.name, g.customer_id,
            ST_DWithin(c.p, g.center, g.radius_m) AS inside,
            CASE WHEN $5::double precision IS NULL THEN NULL
                 ELSE ST_DWithin(ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
                                 g.center, g.radius_m)
            END AS was_inside
     FROM geofences g
     JOIN vehicle_geofence vg ON vg.geofence_id = g.id
     CROSS JOIN cur c
     WHERE vg.vehicle_id = $1`,
    [vehicleId, lon, lat, prev ? prev.lon : null, prev ? prev.lat : null]
  );
  const events = [];
  for (const g of r.rows) {
    const type = classifyTransition(g.inside, g.was_inside);
    if (type) events.push({ ...g, type });
  }
  return events;
}

module.exports = { checkGeofences, classifyTransition };
