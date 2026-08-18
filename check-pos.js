const { pool } = require('./src/db');
pool.query(`SELECT v.id, v.name, count(p.id) AS positions, max(p.recorded_at) AS last
  FROM vehicles v LEFT JOIN positions p ON p.vehicle_id = v.id
  WHERE v.name IN ('Van 12','Van 04','Truck 2') GROUP BY v.id, v.name ORDER BY v.id`)
  .then((r) => { console.log(r.rows); return pool.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
