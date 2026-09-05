// Positions grow without bound (500 vehicles reporting every 5-10s is several
// million rows/day). Disabled by default — set POSITION_RETENTION_DAYS to
// enable pruning. When enabled: for each whole day older than the retention
// window, roll it into position_daily_summary (permanent, tiny) THEN delete
// the raw rows for that day. A day is only ever deleted after its summary
// row is safely committed, and only a few days are processed per tick so a
// large backlog (e.g. enabling this for the first time on an old dataset)
// drains gradually instead of running one huge transaction.

const { pool } = require('./db');

const RETENTION_DAYS = +process.env.POSITION_RETENTION_DAYS || 0; // 0 = disabled, keep everything
const MAX_DAYS_PER_TICK = 5;

async function summarizeAndPruneDay(dayStart) {
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO position_daily_summary (vehicle_id, day, fixes, max_kmh, avg_kmh, distance_km, first_fix, last_fix)
       WITH pts AS (
         SELECT p.vehicle_id, p.id, p.recorded_at, p.speed_kn,
                ST_Distance(p.point, LAG(p.point) OVER (PARTITION BY p.vehicle_id ORDER BY p.device_time)) AS dist_m
         FROM positions p
         WHERE p.device_time >= $1 AND p.device_time < $2 AND p.valid
       )
       SELECT vehicle_id, $1::date,
              COUNT(*), COALESCE(MAX(speed_kn * 1.852), 0), COALESCE(AVG(speed_kn * 1.852), 0),
              COALESCE(SUM(dist_m), 0) / 1000.0, MIN(recorded_at), MAX(recorded_at)
       FROM pts GROUP BY vehicle_id
       ON CONFLICT (vehicle_id, day) DO UPDATE SET
         fixes = EXCLUDED.fixes, max_kmh = EXCLUDED.max_kmh, avg_kmh = EXCLUDED.avg_kmh,
         distance_km = EXCLUDED.distance_km, first_fix = EXCLUDED.first_fix, last_fix = EXCLUDED.last_fix`,
      [dayStart, dayEnd]
    );
    const del = await client.query(
      'DELETE FROM positions WHERE device_time >= $1 AND device_time < $2',
      [dayStart, dayEnd]
    );
    await client.query('COMMIT');
    return del.rowCount;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function tick({ log = console.log } = {}) {
  if (!RETENTION_DAYS) return; // disabled

  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  const oldest = await pool.query('SELECT MIN(device_time) AS min_dt FROM positions');
  if (!oldest.rows[0].min_dt) return; // nothing stored yet

  let day = new Date(oldest.rows[0].min_dt);
  day.setUTCHours(0, 0, 0, 0);

  let processed = 0;
  while (day < cutoff && processed < MAX_DAYS_PER_TICK) {
    const removed = await summarizeAndPruneDay(day);
    log(`retention: summarized + pruned ${day.toISOString().slice(0, 10)} (${removed} rows)`);
    day = new Date(day.getTime() + 24 * 3600 * 1000);
    processed++;
  }
}

function startRetention({ log = console.log } = {}) {
  if (!RETENTION_DAYS) {
    log('retention: disabled (set POSITION_RETENTION_DAYS to enable pruning of raw positions)');
    return;
  }
  const fn = () => tick({ log }).catch((e) => log(`retention: ${e.message}`));
  fn();
  setInterval(fn, 3600_000); // hourly; MAX_DAYS_PER_TICK bounds how fast a backlog drains
}

module.exports = { startRetention, RETENTION_DAYS };
