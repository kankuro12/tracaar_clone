const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { sign, signSessionToken, verify, sha256, randomKey, auth, requireRole, weakPassword, MIN_PASSWORD_LEN } = require('./auth');
const { latestPositions, positionHistory, canSeeVehicle, invalidateVehicleCache, listBlockedImeis, clearBlockedImei, reportSummary, tripPlayback, auditLog, vehicleLimitReached, visibleVehicleIds } = require('./db');
const { rateLimit } = require('./ratelimit');
const { invalidateRules } = require('./rules');
const { recordPayment, changePlanProrated, revenueSummary, previewInvoice } = require('./billing');

const router = Router();

// brute-force guard: 10 attempts / 5 min per IP, keyed separately per route
// so hammering one doesn't burn the budget for the other.
const loginLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, keyFn: (req) => `login:${req.ip}` });
const registerLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, keyFn: (req) => `integration-register:${req.ip}` });

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const r = await pool.query(
    'SELECT id, customer_id, role, email, name, password_hash FROM users WHERE email = $1',
    [String(email).toLowerCase()]
  );
  const user = r.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: sign(user), user: { id: user.id, role: user.role, name: user.name, email: user.email, customerId: user.customer_id } });
});

// ---- Super Admin: onboard a new tenant ----
router.post('/customers', auth, requireRole('super_admin'), async (req, res) => {
  const { name, adminName, adminEmail, adminPassword } = req.body || {};
  if (!name || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'name, adminName, adminEmail, adminPassword required' });
  }
  if (weakPassword(adminPassword)) return res.status(400).json({ error: `adminPassword must be at least ${MIN_PASSWORD_LEN} chars` });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const c = await client.query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [name]);
    await client.query(
      `INSERT INTO users (customer_id, role, email, password_hash, name)
       VALUES ($1, 'admin', $2, $3, $4)`,
      [c.rows[0].id, String(adminEmail).toLowerCase(), await bcrypt.hash(adminPassword, 10), adminName]
    );
    await client.query('COMMIT');
    res.status(201).json({ customerId: c.rows[0].id });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'email already exists' });
    throw e;
  } finally {
    client.release();
  }
});

// ---- Admin: users under own tenant ----
router.get('/users', auth, requireRole('admin'), async (req, res) => {
  const r = await pool.query(
    `SELECT id, customer_id, role, email, name, created_at FROM users WHERE customer_id = $1 ORDER BY id`,
    [req.user.customerId]
  );
  res.json(r.rows);
});

router.post('/users', auth, requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (weakPassword(password)) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LEN} chars` });
  try {
    const r = await pool.query(
      `INSERT INTO users (customer_id, role, email, password_hash, name)
       VALUES ($1, 'user', $2, $3, $4) RETURNING id, role, email, name`,
      [req.user.customerId, String(email).toLowerCase(), await bcrypt.hash(password, 10), name]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email already exists' });
    throw e;
  }
});

// ---- Vehicles ----
router.post('/vehicles', auth, requireRole('admin'), async (req, res) => {
  const { name, imei, plate } = req.body || {};
  if (!name || !imei) return res.status(400).json({ error: 'name and imei required' });
  const limit = await vehicleLimitReached(req.user.customerId);
  if (limit != null) return res.status(403).json({ error: `plan limit reached (${limit} vehicles) — upgrade your plan to add more` });
  try {
    const r = await pool.query(
      `INSERT INTO vehicles (customer_id, imei, name, plate) VALUES ($1, $2, $3, $4)
       RETURNING id, imei, name, plate`,
      [req.user.customerId, String(imei).trim(), name, plate || '']
    );
    invalidateVehicleCache(String(imei).trim());
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'imei already registered' });
    throw e;
  }
});

router.get('/vehicles', auth, async (req, res) => {
  const rows = await latestPositions(req.user);
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, plate: r.plate, imei: r.imei,
    destination: r.dest_lat != null ? { lat: r.dest_lat, lon: r.dest_lon } : null,
    position: r.position_id ? {
      id: r.position_id, recordedAt: r.recorded_at, deviceTime: r.device_time,
      valid: r.valid, lat: r.lat, lon: r.lon, speedKn: r.speed_kn, course: r.course,
    } : null,
  })));
});

router.get('/vehicles/:id', auth, async (req, res) => {
  if (!(await canSeeVehicle(req.user, req.params.id))) {
    return res.status(403).json({ error: 'not allowed to see this vehicle' });
  }
  const r = await pool.query(
    `SELECT v.id, v.name, v.plate, v.imei, v.dest_lat, v.dest_lon,
            p.id AS position_id, p.recorded_at, p.device_time, p.valid, p.lat, p.lon, p.speed_kn, p.course
     FROM vehicles v
     LEFT JOIN LATERAL (SELECT * FROM positions WHERE vehicle_id = v.id ORDER BY device_time DESC LIMIT 1) p ON TRUE
     WHERE v.id = $1`,
    [req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'vehicle not found' });
  const row = r.rows[0];
  res.json({
    id: row.id,
    name: row.name,
    plate: row.plate,
    imei: row.imei,
    destination: row.dest_lat != null ? { lat: row.dest_lat, lon: row.dest_lon } : null,
    position: row.position_id ? {
      id: row.position_id,
      recordedAt: row.recorded_at,
      deviceTime: row.device_time,
      valid: row.valid,
      lat: row.lat,
      lon: row.lon,
      speedKn: row.speed_kn,
      course: row.course,
    } : null,
  });
});

// ---- Assign / unassign vehicle <-> user (admin, own tenant only) ----
async function tenantVehicle(req, res) {
  const v = await pool.query('SELECT id, customer_id FROM vehicles WHERE id = $1', [req.params.id]);
  if (!v.rows.length) { res.status(404).json({ error: 'vehicle not found' }); return null; }
  if (v.rows[0].customer_id !== req.user.customerId) { res.status(403).json({ error: 'forbidden' }); return null; }
  return v.rows[0];
}

router.post('/vehicles/:id/assign', auth, requireRole('admin'), async (req, res) => {
  const v = await tenantVehicle(req, res);
  if (!v) return;
  const userId = req.body && req.body.userId;
  const u = await pool.query('SELECT id, customer_id, role FROM users WHERE id = $1', [userId]);
  if (!u.rows.length || u.rows[0].customer_id !== req.user.customerId || u.rows[0].role !== 'user') {
    return res.status(404).json({ error: 'user not found' });
  }
  await pool.query('INSERT INTO vehicle_user (vehicle_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [v.id, userId]);
  res.status(204).end();
});

router.delete('/vehicles/:id/assign', auth, requireRole('admin'), async (req, res) => {
  const v = await tenantVehicle(req, res);
  if (!v) return;
  const userId = req.body && req.body.userId;
  await pool.query('DELETE FROM vehicle_user WHERE vehicle_id = $1 AND user_id = $2', [v.id, userId]);
  res.status(204).end();
});

// ---- Positions ----
router.get('/positions/latest', auth, async (req, res) => {
  res.json(await latestPositions(req.user));
});

// ---- Position history ----
router.get('/vehicles/:id/positions', auth, async (req, res) => {
  const from = new Date(req.query.from || Date.now() - 6 * 3600 * 1000);
  const to = new Date(req.query.to || Date.now());
  if (to - from > 30 * 24 * 3600 * 1000) return res.status(400).json({ error: 'range too large (max 30 days)' });
  const rows = await positionHistory(req.user, +req.params.id, from, to);
  if (rows === null) return res.status(403).json({ error: 'not allowed to see this vehicle' });
  res.json(rows);
});

// ---- Trip playback (downsampled valid fixes, JSON or CSV) ----
router.get('/vehicles/:id/playback', auth, async (req, res) => {
  const from = new Date(req.query.from || Date.now() - 24 * 3600 * 1000);
  const to = new Date(req.query.to || Date.now());
  if (to - from > 30 * 24 * 3600 * 1000) return res.status(400).json({ error: 'range too large (max 30 days)' });
  const rows = await tripPlayback(req.user, +req.params.id, from, to);
  if (rows === null) return res.status(403).json({ error: 'not allowed' });
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv');
    res.send('recorded_at,lat,lon,speed_kmh,course\n' + rows.map((p) => `${new Date(p.recorded_at).toISOString()},${p.lat},${p.lon},${Math.round(p.speed_kn * 1.852)},${p.course}`).join('\n'));
    return;
  }
  res.json(rows);
});

// ---- Reports summary (JSON or CSV) ----
router.get('/reports/summary', auth, async (req, res) => {
  const from = new Date(req.query.from || Date.now() - 24 * 3600 * 1000);
  const to = new Date(req.query.to || Date.now());
  const rows = await reportSummary(req.user, from, to);
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv');
    res.send('vehicle,plate,imei,fixes,max_kmh,avg_kmh,distance_km,first_fix,last_fix\n' + rows.map((r) => `"${r.name}","${r.plate}","${r.imei}",${r.fixes},${Math.round(r.max_kmh)},${Math.round(r.avg_kmh)},${(+r.distance_km).toFixed(1)},"${r.first_fix || ''}","${r.last_fix || ''}"`).join('\n'));
    return;
  }
  res.json(rows);
});

// ---- Alert rules (admin, own tenant) ----
router.get('/alert-rules', auth, requireRole('admin'), async (req, res) => {
  const r = await pool.query('SELECT * FROM alert_rules WHERE customer_id = $1 ORDER BY type', [req.user.customerId]);
  res.json(r.rows);
});
router.put('/alert-rules', auth, requireRole('admin'), async (req, res) => {
  const { type, threshold, enabled } = req.body || {};
  if (!['overspeed', 'idle', 'offline'].includes(type)) return res.status(400).json({ error: 'bad type' });
  await pool.query(
    `INSERT INTO alert_rules (customer_id, type, threshold, enabled) VALUES ($1,$2,$3,$4)
     ON CONFLICT (customer_id, type) DO UPDATE SET threshold = EXCLUDED.threshold, enabled = EXCLUDED.enabled`,
    [req.user.customerId, type, +threshold || 0, enabled !== false]
  );
  invalidateRules(req.user.customerId); // ingest reads these per frame from a cache
  auditLog({ customerId: req.user.customerId, userId: req.user.id, action: 'alert_rule.upsert', meta: { type, threshold } });
  res.status(204).end();
});

// ---- Destination (ETA target) ----
router.patch('/vehicles/:id/destination', auth, requireRole('admin'), async (req, res) => {
  const v = await tenantVehicle(req, res);
  if (!v) return;
  const { lat, lon, clear } = req.body || {};
  if (clear) {
    await pool.query('UPDATE vehicles SET dest_lat = NULL, dest_lon = NULL WHERE id = $1', [v.id]);
  } else {
    if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'lat and lon required' });
    }
    await pool.query('UPDATE vehicles SET dest_lat = $2, dest_lon = $3 WHERE id = $1', [v.id, lat, lon]);
  }
  res.status(204).end();
});

// ---- Geofences ----
// ponytail: circles only (center + radius) — enough for zone alerts, polygons if needed
function geofenceScope(user) {
  if (user.role === 'super_admin') return { sql: '', params: [] };
  if (user.role === 'admin') return { sql: 'WHERE g.customer_id = $1', params: [user.customerId] };
  return {
    sql: `WHERE g.id IN (
            SELECT vg.geofence_id FROM vehicle_geofence vg
            JOIN vehicle_user vu ON vu.vehicle_id = vg.vehicle_id
            WHERE vu.user_id = $1)`,
    params: [user.id],
  };
}

router.get('/geofences', auth, async (req, res) => {
  const scope = geofenceScope(req.user);
  const g = await pool.query(
    `SELECT g.id, g.name, g.radius_m,
            ST_Y(g.center::geometry) AS lat, ST_X(g.center::geometry) AS lon
     FROM geofences g ${scope.sql} ORDER BY g.id`,
    scope.params
  );
  const veh = await pool.query(`SELECT geofence_id, array_agg(vehicle_id) AS vehicle_ids FROM vehicle_geofence GROUP BY 1`);
  const byId = Object.fromEntries(veh.rows.map((r) => [r.geofence_id, r.vehicle_ids]));
  res.json(g.rows.map((r) => ({ ...r, vehicleIds: byId[r.id] || [] })));
});

router.post('/geofences', auth, requireRole('admin'), async (req, res) => {
  const { name, lat, lon, radiusM, vehicleIds } = req.body || {};
  if (!name || lat == null || lon == null || !radiusM) {
    return res.status(400).json({ error: 'name, lat, lon, radiusM required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const g = await client.query(
      `INSERT INTO geofences (customer_id, name, center, radius_m)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5)
       RETURNING id, name, radius_m`,
      [req.user.customerId, name, lon, lat, radiusM]
    );
    if (Array.isArray(vehicleIds)) {
      for (const vid of vehicleIds) {
        const v = await client.query('SELECT 1 FROM vehicles WHERE id = $1 AND customer_id = $2', [vid, req.user.customerId]);
        if (v.rows.length) {
          await client.query('INSERT INTO vehicle_geofence (geofence_id, vehicle_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g.rows[0].id, vid]);
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json(g.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

async function tenantGeofence(req, res) {
  const g = await pool.query('SELECT id, customer_id FROM geofences WHERE id = $1', [req.params.id]);
  if (!g.rows.length) { res.status(404).json({ error: 'geofence not found' }); return null; }
  if (g.rows[0].customer_id !== req.user.customerId) { res.status(403).json({ error: 'forbidden' }); return null; }
  return g.rows[0];
}

router.post('/geofences/:id/assign', auth, requireRole('admin'), async (req, res) => {
  const g = await tenantGeofence(req, res);
  if (!g) return;
  const v = await pool.query('SELECT 1 FROM vehicles WHERE id = $1 AND customer_id = $2', [req.body && req.body.vehicleId, req.user.customerId]);
  if (!v.rows.length) return res.status(404).json({ error: 'vehicle not found' });
  await pool.query('INSERT INTO vehicle_geofence (geofence_id, vehicle_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g.id, req.body.vehicleId]);
  res.status(204).end();
});

router.delete('/geofences/:id/assign', auth, requireRole('admin'), async (req, res) => {
  const g = await tenantGeofence(req, res);
  if (!g) return;
  await pool.query('DELETE FROM vehicle_geofence WHERE geofence_id = $1 AND vehicle_id = $2', [g.id, req.body && req.body.vehicleId]);
  res.status(204).end();
});

// ---- Alerts ----
router.get('/alerts', auth, async (req, res) => {
  const limit = Math.min(+req.query.limit || 50, 200);
  let rows;
  if (req.user.role === 'super_admin') {
    rows = await pool.query('SELECT * FROM alerts ORDER BY id DESC LIMIT $1', [limit]);
  } else if (req.user.role === 'admin') {
    rows = await pool.query('SELECT * FROM alerts WHERE customer_id = $1 ORDER BY id DESC LIMIT $2', [req.user.customerId, limit]);
  } else {
    rows = await pool.query(
      `SELECT a.* FROM alerts a
       JOIN vehicle_user vu ON vu.vehicle_id = a.vehicle_id
       WHERE vu.user_id = $1 ORDER BY a.id DESC LIMIT $2`,
      [req.user.id, limit]
    );
  }
  res.json(rows.rows);
});

// ---- Route optimization (waypoint ordering, greedy nearest-neighbour) ----
// ponytail: haversine + greedy; optimal TSP / road-network routing needs OSRM — add when asked
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

router.post('/routes/optimize', auth, async (req, res) => {
  const wps = req.body && req.body.waypoints;
  if (!Array.isArray(wps) || wps.length < 2 || wps.length > 50) {
    return res.status(400).json({ error: 'waypoints: array of [lat,lon], 2..50 entries' });
  }
  const pts = wps.map((w) => [Number(w[0]), Number(w[1])]);
  if (pts.some(([la, lo]) => la < -90 || la > 90 || lo < -180 || lo > 180)) {
    return res.status(400).json({ error: 'bad waypoint' });
  }
  const order = [0];
  const remaining = pts.map((_, i) => i).slice(1);
  let total = 0;
  while (remaining.length) {
    const cur = pts[order[order.length - 1]];
    let best = 0, bestD = Infinity;
    for (const i of remaining) {
      const d = haversineKm(cur, pts[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    total += bestD;
    order.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  res.json({ order, totalKm: Math.round(total * 10) / 10, points: order.map((i) => pts[i]) });
});

// ---- Billing: plans (super), invoices ----
router.get('/plans', auth, requireRole('super_admin'), async (req, res) => {
  const r = await pool.query('SELECT * FROM plans ORDER BY price_monthly');
  res.json(r.rows);
});

router.post('/plans', auth, requireRole('super_admin'), async (req, res) => {
  const { name, priceMonthly, maxVehicles } = req.body || {};
  if (!name || priceMonthly == null) return res.status(400).json({ error: 'name and priceMonthly required' });
  const r = await pool.query(
    `INSERT INTO plans (name, price_monthly, max_vehicles) VALUES ($1,$2,$3) RETURNING *`,
    [name, priceMonthly, maxVehicles == null ? -1 : maxVehicles]
  );
  res.status(201).json(r.rows[0]);
});

router.get('/customers', auth, requireRole('super_admin'), async (req, res) => {
  const r = await pool.query(
    `SELECT c.id, c.name, c.plan_id, c.alert_email, c.alert_webhook, c.created_at,
            p.name AS plan, p.price_monthly,
            (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id) AS vehicle_count,
            (SELECT count(*) FROM users u WHERE u.customer_id = c.id) AS user_count
     FROM customers c LEFT JOIN plans p ON p.id = c.plan_id ORDER BY c.id`
  );
  res.json(r.rows);
});

router.patch('/customers/:id', auth, requireRole('super_admin'), async (req, res) => {
  const { planId, alertEmail, alertWebhook } = req.body || {};
  await pool.query(
    'UPDATE customers SET plan_id = COALESCE($2, plan_id), alert_email = COALESCE($3, alert_email), alert_webhook = COALESCE($4, alert_webhook) WHERE id = $1',
    [req.params.id, planId ?? null, alertEmail ?? null, alertWebhook ?? null]
  );
  res.status(204).end();
});

// ---- Super admin: manage a customer's vehicles ("assign IMEIs") ----
async function customerExists(req, res) {
  const c = await pool.query('SELECT id FROM customers WHERE id = $1', [req.params.id]);
  if (!c.rows.length) { res.status(404).json({ error: 'customer not found' }); return null; }
  return c.rows[0];
}

router.get('/customers/:id/vehicles', auth, requireRole('super_admin'), async (req, res) => {
  if (!(await customerExists(req, res))) return;
  const r = await pool.query(
    `SELECT v.id, v.imei, v.name, v.plate, v.created_at,
            p.device_time AS last_reported
     FROM vehicles v
     LEFT JOIN LATERAL (
       SELECT device_time FROM positions p WHERE p.vehicle_id = v.id
       ORDER BY p.device_time DESC LIMIT 1
     ) p ON TRUE
     WHERE v.customer_id = $1 ORDER BY v.id`,
    [req.params.id]
  );
  res.json(r.rows);
});

router.post('/customers/:id/vehicles', auth, requireRole('super_admin'), async (req, res) => {
  if (!(await customerExists(req, res))) return;
  const { name, imei, plate } = req.body || {};
  if (!name || !imei) return res.status(400).json({ error: 'name and imei required' });
  const limit = await vehicleLimitReached(req.params.id);
  if (limit != null) return res.status(403).json({ error: `plan limit reached (${limit} vehicles) — upgrade the customer's plan to add more` });
  try {
    const r = await pool.query(
      `INSERT INTO vehicles (customer_id, imei, name, plate) VALUES ($1, $2, $3, $4)
       RETURNING id, imei, name, plate`,
      [req.params.id, String(imei).trim(), name, plate || '']
    );
    invalidateVehicleCache(String(imei).trim());
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'imei already registered' });
    throw e;
  }
});

router.delete('/customers/:id/vehicles/:vid', auth, requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM vehicles WHERE id = $1 AND customer_id = $2', [req.params.vid, req.params.id]);
  invalidateVehicleCache(); // no imei known here — drop the whole cache
  res.status(204).end();
});

// ---- Super admin: manage a customer's users ----
router.get('/customers/:id/users', auth, requireRole('super_admin'), async (req, res) => {
  if (!(await customerExists(req, res))) return;
  const r = await pool.query(
    'SELECT id, customer_id, role, email, name, created_at FROM users WHERE customer_id = $1 ORDER BY id',
    [req.params.id]
  );
  res.json(r.rows);
});

router.post('/customers/:id/users', auth, requireRole('super_admin'), async (req, res) => {
  if (!(await customerExists(req, res))) return;
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (weakPassword(password)) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LEN} chars` });
  try {
    const r = await pool.query(
      `INSERT INTO users (customer_id, role, email, password_hash, name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, role, email, name`,
      [req.params.id, role === 'admin' ? 'admin' : 'user', String(email).toLowerCase(), await bcrypt.hash(password, 10), name]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email already exists' });
    throw e;
  }
});

router.patch('/customers/:id/users/:uid/password', auth, requireRole('super_admin'), async (req, res) => {
  const { password } = req.body || {};
  if (weakPassword(password)) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LEN} chars` });
  const r = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 AND customer_id = $3 RETURNING id',
    [await bcrypt.hash(password, 10), req.params.uid, req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'user not found' });
  res.status(204).end();
});

router.delete('/customers/:id/users/:uid', auth, requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1 AND customer_id = $2', [req.params.uid, req.params.id]);
  res.status(204).end();
});

// Admin resets the password of one of their own tenant's users
router.patch('/users/:id/password', auth, requireRole('admin'), async (req, res) => {
  const { password } = req.body || {};
  if (weakPassword(password)) return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LEN} chars` });
  const r = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 AND customer_id = $3 RETURNING id',
    [await bcrypt.hash(password, 10), req.params.id, req.user.customerId]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'user not found' });
  res.status(204).end();
});

router.get('/invoices', auth, async (req, res) => {
  const paidExpr = '(SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id = i.id)';
  let rows;
  if (req.user.role === 'super_admin') {
    rows = await pool.query(
      `SELECT i.*, c.name AS customer, ${paidExpr} AS paid_amount
         FROM invoices i JOIN customers c ON c.id = i.customer_id
        ORDER BY i.period_end DESC, i.id DESC LIMIT 500`);
  } else if (req.user.role === 'admin') {
    rows = await pool.query(
      `SELECT i.*, ${paidExpr} AS paid_amount FROM invoices i
        WHERE i.customer_id = $1 ORDER BY i.period_end DESC, i.id DESC`,
      [req.user.customerId]);
  } else {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json(rows.rows.map((r) => ({ ...r, balance: +(Number(r.amount) - Number(r.paid_amount)).toFixed(2) })));
});

// Single invoice with its line items and payment history.
async function invoiceForUser(req, res) {
  const r = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  const inv = r.rows[0];
  if (!inv) { res.status(404).json({ error: 'invoice not found' }); return null; }
  if (req.user.role !== 'super_admin' && String(inv.customer_id) !== String(req.user.customerId)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return inv;
}

router.get('/invoices/:id', auth, async (req, res) => {
  const inv = await invoiceForUser(req, res);
  if (!inv) return;
  const [lines, payments] = await Promise.all([
    pool.query('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY sort, id', [inv.id]),
    pool.query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC', [inv.id]),
  ]);
  const paid = payments.rows.reduce((s, p) => s + Number(p.amount), 0);
  res.json({
    ...inv,
    lines: lines.rows,
    payments: payments.rows,
    paid_amount: +paid.toFixed(2),
    balance: +(Number(inv.amount) - paid).toFixed(2),
  });
});

// Record a payment (full or partial). Replaces the old "mark paid" flag flip.
router.post('/invoices/:id/payments', auth, requireRole('admin', 'super_admin'), async (req, res) => {
  const inv = await invoiceForUser(req, res);
  if (!inv) return;
  const { amount, method, reference, note } = req.body || {};
  const result = await recordPayment({
    invoiceId: inv.id,
    amount: amount == null ? Number(inv.amount) : Number(amount),
    method, reference, note,
    userId: req.user.id,
  });
  if (result.error) return res.status(400).json({ error: result.error });
  auditLog({ customerId: inv.customer_id, userId: req.user.id, action: 'invoice.payment', meta: { invoiceId: inv.id, amount: result.paid } });
  res.json(result);
});

// Kept for older clients: pay the full remaining balance.
router.post('/invoices/:id/pay', auth, async (req, res) => {
  const inv = await invoiceForUser(req, res);
  if (!inv) return;
  const paidR = await pool.query('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = $1', [inv.id]);
  const balance = Number(inv.amount) - Number(paidR.rows[0].paid);
  const result = await recordPayment({ invoiceId: inv.id, amount: balance, method: 'manual', userId: req.user.id });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.invoice);
});

router.post('/invoices/:id/void', auth, requireRole('super_admin'), async (req, res) => {
  const inv = await invoiceForUser(req, res);
  if (!inv) return;
  await pool.query("UPDATE invoices SET status = 'void', voided_at = now() WHERE id = $1", [inv.id]);
  auditLog({ customerId: inv.customer_id, userId: req.user.id, action: 'invoice.void', meta: { invoiceId: inv.id } });
  res.status(204).end();
});

// What the current period will cost, before it is invoiced.
router.get('/billing/preview', auth, requireRole('admin', 'super_admin'), async (req, res) => {
  const cid = req.user.role === 'super_admin' ? req.query.customerId : req.user.customerId;
  if (!cid) return res.status(400).json({ error: 'customerId required' });
  const preview = await previewInvoice(cid);
  if (!preview) return res.status(404).json({ error: 'customer has no plan' });
  res.json(preview);
});

router.get('/billing/summary', auth, requireRole('super_admin'), async (req, res) => {
  res.json(await revenueSummary());
});

// Change a customer's plan, prorating the open invoice.
router.post('/customers/:id/plan', auth, requireRole('super_admin'), async (req, res) => {
  const { planId } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'planId required' });
  const result = await changePlanProrated({ customerId: req.params.id, newPlanId: planId, userId: req.user.id });
  if (result.error) return res.status(400).json({ error: result.error });
  auditLog({ customerId: req.params.id, userId: req.user.id, action: 'customer.plan_change', meta: { planId, prorated: result.prorated } });
  res.json(result);
});

// ---- Drivers ----
router.get('/drivers', auth, requireRole('admin'), async (req, res) => {
  const r = await pool.query(
    `SELECT d.*, (SELECT count(*) FROM vehicles v WHERE v.driver_id = d.id) AS vehicle_count
       FROM drivers d WHERE d.customer_id = $1 ORDER BY d.name`,
    [req.user.customerId]);
  res.json(r.rows);
});

router.post('/drivers', auth, requireRole('admin'), async (req, res) => {
  const { name, licenseNo, phone, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = await pool.query(
    `INSERT INTO drivers (customer_id, name, license_no, phone, email)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.customerId, name, licenseNo || null, phone || null, email || null]);
  res.status(201).json(r.rows[0]);
});

router.delete('/drivers/:id', auth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM drivers WHERE id = $1 AND customer_id = $2', [req.params.id, req.user.customerId]);
  res.status(204).end();
});

// Assign a driver to a vehicle (null clears).
router.patch('/vehicles/:id/driver', auth, requireRole('admin'), async (req, res) => {
  const v = await tenantVehicle(req, res);
  if (!v) return;
  const { driverId } = req.body || {};
  if (driverId) {
    const d = await pool.query('SELECT 1 FROM drivers WHERE id = $1 AND customer_id = $2', [driverId, req.user.customerId]);
    if (!d.rows.length) return res.status(404).json({ error: 'driver not found' });
  }
  await pool.query('UPDATE vehicles SET driver_id = $2 WHERE id = $1', [v.id, driverId || null]);
  res.status(204).end();
});

// ---- Driver behaviour scoring ----
// Score starts at 100 and is docked per harsh event per 100 km driven, so a
// van that covers more ground isn't punished for it.
router.get('/behaviour', auth, async (req, res) => {
  const from = new Date(req.query.from || Date.now() - 7 * 24 * 3600 * 1000);
  const to = new Date(req.query.to || Date.now());
  const ids = await visibleVehicleIds(req.user);
  if (!ids.size) return res.json([]);
  const idList = [...ids].map(Number);
  const r = await pool.query(
    `WITH pts AS (
       SELECT p.vehicle_id,
              ST_Distance(p.point, LAG(p.point) OVER (PARTITION BY p.vehicle_id ORDER BY p.device_time)) AS dist_m
         FROM positions p
        WHERE p.vehicle_id = ANY($1::bigint[]) AND p.device_time >= $2 AND p.device_time <= $3 AND p.valid
     ),
     dist AS (
       SELECT vehicle_id, COALESCE(SUM(dist_m),0)/1000.0 AS km FROM pts GROUP BY vehicle_id
     ),
     ev AS (
       SELECT vehicle_id,
              count(*) FILTER (WHERE type = 'harsh_brake') AS brakes,
              count(*) FILTER (WHERE type = 'harsh_accel') AS accels,
              count(*) FILTER (WHERE type = 'harsh_turn')  AS turns
         FROM driving_events
        WHERE vehicle_id = ANY($1::bigint[]) AND occurred_at >= $2 AND occurred_at <= $3
        GROUP BY vehicle_id
     )
     SELECT v.id, v.name, v.plate, d.name AS driver_name,
            COALESCE(dist.km,0) AS km,
            COALESCE(ev.brakes,0) AS harsh_brakes,
            COALESCE(ev.accels,0) AS harsh_accels,
            COALESCE(ev.turns,0)  AS harsh_turns
       FROM vehicles v
       LEFT JOIN drivers d ON d.id = v.driver_id
       LEFT JOIN dist ON dist.vehicle_id = v.id
       LEFT JOIN ev   ON ev.vehicle_id = v.id
      WHERE v.id = ANY($1::bigint[])
      ORDER BY v.name`,
    [idList, from, to]
  );
  res.json(r.rows.map((row) => {
    const km = Number(row.km) || 0;
    const events = Number(row.harsh_brakes) + Number(row.harsh_accels) + Number(row.harsh_turns);
    const per100 = km > 1 ? (events / km) * 100 : events;
    const score = Math.max(0, Math.min(100, Math.round(100 - per100 * 5)));
    return { ...row, km: +km.toFixed(1), events, score };
  }));
});

// ---- Maintenance reminders ----
router.get('/maintenance', auth, requireRole('admin'), async (req, res) => {
  const r = await pool.query(
    `SELECT m.*, v.name AS vehicle_name FROM maintenance m
       JOIN vehicles v ON v.id = m.vehicle_id
      WHERE m.customer_id = $1
      ORDER BY m.completed_at NULLS FIRST, m.due_date NULLS LAST, m.id DESC`,
    [req.user.customerId]);
  res.json(r.rows);
});

router.post('/maintenance', auth, requireRole('admin'), async (req, res) => {
  const { vehicleId, title, dueDate, dueKm, notes } = req.body || {};
  if (!vehicleId || !title) return res.status(400).json({ error: 'vehicleId and title required' });
  if (!dueDate && !dueKm) return res.status(400).json({ error: 'set a due date, a due distance, or both' });
  const v = await pool.query('SELECT 1 FROM vehicles WHERE id = $1 AND customer_id = $2', [vehicleId, req.user.customerId]);
  if (!v.rows.length) return res.status(404).json({ error: 'vehicle not found' });
  const r = await pool.query(
    `INSERT INTO maintenance (customer_id, vehicle_id, title, due_date, due_km, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.customerId, vehicleId, title, dueDate || null, dueKm || null, notes || null]);
  res.status(201).json(r.rows[0]);
});

router.post('/maintenance/:id/complete', auth, requireRole('admin'), async (req, res) => {
  const r = await pool.query(
    'UPDATE maintenance SET completed_at = now() WHERE id = $1 AND customer_id = $2 RETURNING *',
    [req.params.id, req.user.customerId]);
  if (!r.rows.length) return res.status(404).json({ error: 'reminder not found' });
  res.json(r.rows[0]);
});

router.delete('/maintenance/:id', auth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM maintenance WHERE id = $1 AND customer_id = $2', [req.params.id, req.user.customerId]);
  res.status(204).end();
});

// ---- ERP / 3rd-party integration ----
// Flow: ERP holds an API key (per customer) -> mints short-lived session token
// carrying vehicle ids -> connects to ws://host/ws?token=<session> -> receives
// live positions for exactly those vehicles. Session TTL is chosen by the ERP,
// capped at 24h.

const MIN_TTL = 30;
const MAX_TTL = 24 * 3600;

async function apiKeyCustomer(req, res) {
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-api-key'];
  if (!key) { res.status(401).json({ error: 'missing integration key' }); return null; }
  const r = await pool.query(
    `SELECT k.id, k.customer_id, k.client_id FROM integration_keys k
     WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
    [sha256(key)]
  );
  if (!r.rows.length) { res.status(401).json({ error: 'invalid or revoked integration key' }); return null; }
  return r.rows[0];
}

// ERP self-service: register a client using a dashboard admin's credentials.
// Creates the API key bound to that admin's customer, or rotates the existing
// key if the erpClientId already has one (old key dies immediately).
router.post('/integration/register', registerLimiter, async (req, res) => {
  const { erpClientId, email, password } = req.body || {};
  if (!erpClientId || !email || !password) {
    return res.status(400).json({ error: 'erpClientId, email, password required' });
  }
  const r = await pool.query(
    `SELECT customer_id, password_hash FROM users WHERE email = $1 AND role = 'admin'`,
    [String(email).toLowerCase()]
  );
  const admin = r.rows[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'invalid admin credentials' });
  }
  const clientId = String(erpClientId);
  const apiKey = randomKey();
  const existing = await pool.query('SELECT id FROM integration_keys WHERE client_id = $1', [clientId]);
  if (existing.rows.length) {
    await pool.query('UPDATE integration_keys SET key_hash = $1 WHERE id = $2', [sha256(apiKey), existing.rows[0].id]);
  } else {
    try {
      await pool.query(
        'INSERT INTO integration_keys (customer_id, name, key_hash, client_id) VALUES ($1, $2, $3, $4)',
        [admin.customer_id, clientId, sha256(apiKey), clientId]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'clientId already in use' });
      throw e;
    }
  }
  // key shown exactly once — only the hash is stored
  res.status(201).json({ customerId: admin.customer_id, erpClientId: clientId, apiKey });
});

router.post('/integration/keys', auth, requireRole('admin'), async (req, res) => {
  const { name, clientId } = req.body || {};
  if (!name || !clientId) return res.status(400).json({ error: 'name and clientId (erp_client_id) required' });
  const key = randomKey();
  try {
    await pool.query(
      'INSERT INTO integration_keys (customer_id, name, key_hash, client_id) VALUES ($1, $2, $3, $4)',
      [req.user.customerId, name, sha256(key), clientId || null]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'clientId already in use' });
    throw e;
  }
  // key shown exactly once — only the hash is stored
  res.status(201).json({ name, clientId: clientId || null, key });
});

router.get('/integration/keys', auth, requireRole('admin'), async (req, res) => {
  const r = await pool.query(
    `SELECT id, name, client_id, created_at, revoked_at FROM integration_keys WHERE customer_id = $1 ORDER BY id`,
    [req.user.customerId]
  );
  res.json(r.rows);
});

router.post('/integration/keys/:id/revoke', auth, requireRole('admin'), async (req, res) => {
  await pool.query(
    'UPDATE integration_keys SET revoked_at = now() WHERE id = $1 AND customer_id = $2 AND revoked_at IS NULL',
    [req.params.id, req.user.customerId]
  );
  res.status(204).end();
});

// The ERP endpoint: key (header or body) or admin JWT all work here.
router.post('/integration/session', async (req, res) => {
  let customerId = null, tokenUser = null;
  const { erpClientId, apiKey: bodyKey, clientId, vehicleIds: vids, ttlSeconds, sessionLengthSeconds, session_length } = req.body || {};
  try {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) tokenUser = verify(h.slice(7));
  } catch { /* not a user token — try API key below */ }
  if (tokenUser) {
    if (tokenUser.role === 'super_admin') customerId = null; // any vehicle
    else if (tokenUser.role === 'admin') customerId = tokenUser.customerId;
    else return res.status(403).json({ error: 'forbidden' });
  } else {
    // API key in Authorization header (fk_...) or in the body (apiKey field)
    const sentKey = bodyKey || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const key = await apiKeyCustomer({ ...req, headers: sentKey ? { authorization: `Bearer ${sentKey}` } : {} }, res);
    if (!key) return;
    customerId = key.customer_id;
    // keys are bound to a clientId — the ERP must send it (header or body)
    if (key.client_id) {
      const sentClient = erpClientId || clientId;
      if (sentClient !== key.client_id) {
        return res.status(403).json({ error: 'erpClientId does not match integration key' });
      }
    }
  }

  if (!Array.isArray(vids) || !vids.length) return res.status(400).json({ error: 'vehicleIds required' });
  if (vids.length > 500) return res.status(400).json({ error: 'too many vehicles (max 500)' });
  const ttl = Math.min(Math.max(+(ttlSeconds ?? sessionLengthSeconds ?? session_length) || 300, MIN_TTL), MAX_TTL);

  const q = customerId == null
    ? await pool.query('SELECT id FROM vehicles WHERE id = ANY($1::bigint[])', [vids])
    : await pool.query('SELECT id FROM vehicles WHERE id = ANY($1::bigint[]) AND customer_id = $2', [vids, customerId]);
  const allowed = q.rows.map((r) => r.id);
  if (!allowed.length) return res.status(403).json({ error: 'no allowed vehicles' });

  const token = signSessionToken({ customerId, vehicleIds: allowed, ttlSeconds: ttl });
  res.json({
    token,
    vehicleIds: allowed,
    expiresIn: ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    wsUrl: `/ws?token=${token}`,
  });
});

// Vehicle catalog for the ERP (by API key), so it can map ids before subscribing.
router.get('/integration/vehicles', async (req, res) => {
  const key = await apiKeyCustomer(req, res);
  if (!key) return;
  const r = await pool.query('SELECT id, name, plate, imei FROM vehicles WHERE customer_id = $1 ORDER BY id', [key.customer_id]);
  res.json(r.rows);
});

// ---- Blocked IMEI forensics (super_admin) — deduped list + IP ----
router.get('/blocked-imeis', auth, requireRole('super_admin'), async (req, res) => {
  const limit = Math.min(+req.query.limit || 100, 500);
  const offset = Math.max(+req.query.offset || 0, 0);
  const page = Math.max(+req.query.page || 1, 1);
  const per = Math.min(+req.query.per || limit, 500);
  const off = req.query.page ? (page - 1) * per : offset;
  const lim = req.query.page ? per : limit;
  const { rows, total } = await listBlockedImeis({ limit: lim, offset: off });
  res.json({ rows, total, page: req.query.page ? page : undefined, per: lim });
});

router.delete('/blocked-imeis/:imei', auth, requireRole('super_admin'), async (req, res) => {
  await clearBlockedImei(req.params.imei);
  res.status(204).end();
});

router.delete('/blocked-imeis', auth, requireRole('super_admin'), async (req, res) => {
  const imei = req.query.imei || (req.body && req.body.imei);
  await clearBlockedImei(imei || null);
  res.status(204).end();
});

module.exports = router;
