// Server-rendered dashboard (no SPA): login + admin pages, session-protected.
// Writes go through the existing /api JSON endpoints — auth middleware accepts
// the session cookie, so page forms just fetch /api with no token handling.
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool, latestPositions, canSeeVehicle } = require('./db');
const { sign } = require('./auth');

const router = Router();
const PER_PAGE = 25;

const NAV = {
  super_admin: [
    ['/admin/customers', 'Customers'],
    ['/admin/plans', 'Plans'],
    ['/admin/invoices', 'Invoices'],
    ['/admin/blocked-imeis', 'Blocked IMEIs'],
  ],
  admin: [
    ['/portal', 'Overview'],
    ['/app', 'Live map'],
    ['/portal/trips', 'Trips'],
    ['/portal/alerts', 'Alerts'],
    ['/portal/reports', 'Reports'],
    ['/admin/vehicles', 'Vehicles'],
    ['/admin/geofences', 'Geofences'],
    ['/admin/billing', 'Billing'],
    ['/admin/integration', 'Integration'],
  ],
  user: [
    ['/portal', 'Overview'],
    ['/app', 'Live map'],
    ['/portal/trips', 'Trips'],
    ['/portal/alerts', 'Alerts'],
    ['/portal/reports', 'Reports'],
    ['/portal/billing', 'Billing'],
  ],
};

const money = (n) => `$${Number(n).toFixed(2)}`;
const fmtDT = (s) => (s ? new Date(s).toLocaleString() : '—');

function pageQuery(req) {
  const page = Math.max(1, +req.query.page || 1);
  return { page, offset: (page - 1) * PER_PAGE, per: PER_PAGE };
}
function pager(page, pages, base) {
  const links = [];
  if (page > 1) links.push(`<a href="${base}?page=${page - 1}">&larr; Prev</a>`);
  links.push(`<span>Page ${page} / ${pages || 1}</span>`);
  if (page < pages) links.push(`<a href="${base}?page=${page + 1}">Next &rarr;</a>`);
  return links.join('');
}

router.use((req, res, next) => {
  res.locals.money = money;
  res.locals.fmtDT = fmtDT;
  res.locals.pager = pager;
  res.locals.user = req.session && req.session.user;
  res.locals.nav = res.locals.user ? NAV[res.locals.user.role] || [] : [];
  next();
});

function loadUser(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  req.user = req.session.user;
  next();
}
function rolePage(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).render('error', { message: 'forbidden — you do not have access to this page' });
}

// ---- auth ----
router.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).render('login', { error: 'email and password required' });
  const r = await pool.query(
    'SELECT id, customer_id, role, email, name, password_hash FROM users WHERE email = $1',
    [String(email).toLowerCase()]
  );
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).render('login', { error: 'invalid credentials' });
  }
  const user = { id: u.id, role: u.role, customerId: u.customer_id, name: u.name, email: u.email };
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.user = user;
    req.session.token = sign({ id: u.id, role: u.role, customer_id: u.customer_id });
    res.redirect(user.role === 'super_admin' ? '/admin/customers' : '/portal');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---- public landing ----
router.get('/', async (req, res) => {
  if (req.session && req.session.user) return res.redirect('/portal');
  const plans = await pool.query('SELECT name, price_monthly, max_vehicles FROM plans ORDER BY price_monthly LIMIT 3').catch(() => ({ rows: [] }));
  res.render('landing', { plans: plans.rows, user: null, nav: [] });
});

// ---- live map (app) ----
router.get('/app', loadUser, (req, res) => {
  res.render('map', { token: req.session.token, active: 'app' });
});

// ---- customer portal ----
const { latestPositions: _latest, reportSummary: _summary } = require('./db');
router.get('/portal', loadUser, rolePage('admin', 'user'), async (req, res) => {
  const vehicles = await _latest(req.user);
  const online = vehicles.filter((v) => v.recorded_at && Date.now() - new Date(v.recorded_at).getTime() < 3 * 60 * 1000).length;
  const alerts = await pool.query(
    req.user.role === 'admin'
      ? 'SELECT * FROM alerts WHERE customer_id = $1 ORDER BY id DESC LIMIT 5'
      : `SELECT a.* FROM alerts a JOIN vehicle_user vu ON vu.vehicle_id = a.vehicle_id WHERE vu.user_id = $1 ORDER BY a.id DESC LIMIT 5`,
    [req.user.role === 'admin' ? req.user.customerId : req.user.id]
  ).then((r) => r.rows).catch(() => []);
  res.render('portal-overview', { vehicles, online, offline: vehicles.length - online, alerts, active: 'portal', token: req.session.token });
});
router.get('/portal/trips', loadUser, rolePage('admin', 'user'), async (req, res) => {
  const vehicles = await _latest(req.user);
  res.render('portal-trips', { vehicles, active: 'portal/trips', token: req.session.token });
});
router.get('/portal/alerts', loadUser, rolePage('admin', 'user'), async (req, res) => {
  const q = pageQuery(req);
  const params = req.user.role === 'admin' ? [req.user.customerId, q.per, q.offset] : [req.user.id, q.per, q.offset];
  const sql = req.user.role === 'admin'
    ? 'SELECT * FROM alerts WHERE customer_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3'
    : `SELECT a.* FROM alerts a JOIN vehicle_user vu ON vu.vehicle_id = a.vehicle_id WHERE vu.user_id = $1 ORDER BY a.id DESC LIMIT $2 OFFSET $3`;
  const rows = await pool.query(sql, params).then((r) => r.rows).catch(() => []);
  const csql = req.user.role === 'admin' ? 'SELECT count(*) FROM alerts WHERE customer_id = $1' : `SELECT count(*) FROM alerts a JOIN vehicle_user vu ON vu.vehicle_id = a.vehicle_id WHERE vu.user_id = $1`;
  const total = await pool.query(csql, [params[0]]).then((r) => +r.rows[0].count).catch(() => 0);
  res.render('portal-alerts', { alerts: rows, page: q.page, pages: Math.ceil(total / q.per), total, active: 'portal/alerts' });
});
router.get('/portal/reports', loadUser, rolePage('admin', 'user'), async (req, res) => {
  const to = new Date(req.query.to || Date.now());
  const from = new Date(req.query.from || Date.now() - 24 * 3600 * 1000);
  const rows = await _summary(req.user, from, to).catch(() => []);
  res.render('portal-reports', { rows, from: from.toISOString().slice(0, 16), to: to.toISOString().slice(0, 16), active: 'portal/reports' });
});
router.get('/portal/billing', loadUser, rolePage('admin', 'user'), async (req, res) => {
  const rows = await pool.query('SELECT * FROM invoices WHERE customer_id = $1 ORDER BY period_end DESC LIMIT 50', [req.user.customerId]).then((r) => r.rows).catch(() => []);
  res.render('portal-billing', { invoices: rows, active: 'portal/billing' });
});

const SUPER_ONLY = { customers: 1, 'customers/:id': 1, plans: 1, invoices: 1, 'blocked-imeis': 1 };

// ---- blocked IMEI forensics (super_admin) — explicit route before generic ----
router.get('/admin/blocked-imeis', loadUser, rolePage('super_admin'), async (req, res) => {
  const q = pageQuery(req);
  const { listBlockedImeis } = require('./db');
  const { rows, total } = await listBlockedImeis({ limit: q.per, offset: q.offset });
  res.render('blocked-imeis', { rows, page: q.page, pages: Math.ceil(total / q.per), total, active: 'blocked-imeis' });
});

router.get('/admin/customers/:id', loadUser, rolePage('super_admin'), async (req, res) => {
  const c = await pool.query(
    `SELECT c.*, p.name AS plan, p.price_monthly FROM customers c
     LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1`, [req.params.id]);
  if (!c.rows.length) return res.status(404).render('error', { message: 'customer not found' });
  const [vehicles, users] = await Promise.all([
    pool.query(
      `SELECT v.id, v.imei, v.name, v.plate, v.created_at,
              p.recorded_at AS last_reported
       FROM vehicles v
       LEFT JOIN LATERAL (SELECT recorded_at FROM positions p WHERE p.vehicle_id = v.id
                          ORDER BY p.recorded_at DESC LIMIT 1) p ON TRUE
       WHERE v.customer_id = $1 ORDER BY v.id`, [req.params.id]),
    pool.query('SELECT id, customer_id, role, email, name, created_at FROM users WHERE customer_id = $1 ORDER BY id', [req.params.id]),
  ]);
  res.render('customer', { customer: c.rows[0], vehicles: vehicles.rows, users: users.rows, active: 'customers' });
});

router.get('/admin/:page', loadUser, async (req, res) => {
  const page = req.params.page;
  const isSuper = req.user.role === 'super_admin';
  const isAdmin = req.user.role === 'admin';
  if (SUPER_ONLY[page] && !isSuper) return res.status(403).render('error', { message: 'forbidden' });
  if (!SUPER_ONLY[page] && !isAdmin) return res.status(403).render('error', { message: 'forbidden' });

  if (page === 'customers') {
    const [customers, plans] = await Promise.all([
      pool.query(
        `SELECT c.id, c.name, c.plan_id, c.alert_email, c.alert_webhook, c.created_at,
                p.name AS plan, p.price_monthly,
                (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id) AS vehicle_count,
                (SELECT count(*) FROM users u WHERE u.customer_id = c.id) AS user_count
         FROM customers c LEFT JOIN plans p ON p.id = c.plan_id ORDER BY c.id`),
      pool.query('SELECT * FROM plans ORDER BY price_monthly'),
    ]);
    return res.render('customers', { customers: customers.rows, plans: plans.rows, active: page });
  }
  if (page === 'plans') {
    const plans = await pool.query('SELECT * FROM plans ORDER BY price_monthly');
    return res.render('plans', { plans: plans.rows, active: page });
  }
  if (page === 'users') {
    const users = await pool.query('SELECT id, customer_id, role, email, name, created_at FROM users WHERE customer_id = $1 ORDER BY id', [req.user.customerId]);
    return res.render('users', { users: users.rows, active: page });
  }
  if (page === 'vehicles') {
    const [vehicles, users, assigned] = await Promise.all([
      latestPositions(req.user),
      pool.query('SELECT id, name FROM users WHERE customer_id = $1 ORDER BY id', [req.user.customerId]),
      pool.query(
        `SELECT v.id AS vehicle_id, array_agg(u.name ORDER BY u.name) AS users
         FROM vehicle_user vu JOIN vehicles v ON v.id = vu.vehicle_id
         JOIN users u ON u.id = vu.user_id
         WHERE v.customer_id = $1 GROUP BY v.id`, [req.user.customerId]),
    ]);
    const assignedMap = Object.fromEntries(assigned.rows.map((r) => [r.vehicle_id, r.users]));
    return res.render('vehicles', { vehicles, users: users.rows, assignedMap, active: page });
  }
  if (page === 'geofences') {
    const [geofences, vehicles] = await Promise.all([
      pool.query(
        `SELECT g.id, g.name, g.radius_m,
                ST_Y(g.center::geometry) AS lat, ST_X(g.center::geometry) AS lon
         FROM geofences g WHERE g.customer_id = $1 ORDER BY g.id`, [req.user.customerId]),
      pool.query('SELECT id, name FROM vehicles WHERE customer_id = $1 ORDER BY id', [req.user.customerId]),
    ]);
    const veh = await pool.query('SELECT geofence_id, array_agg(vehicle_id) AS vehicle_ids FROM vehicle_geofence GROUP BY 1');
    const byId = Object.fromEntries(veh.rows.map((r) => [r.geofence_id, r.vehicle_ids]));
    return res.render('geofences', { geofences: geofences.rows.map((g) => ({ ...g, vehicleIds: byId[g.id] || [] })), vehicles: vehicles.rows, active: page });
  }
  if (page === 'routes') return res.render('routes', { active: page });
  if (page === 'alerts') {
    const q = pageQuery(req);
    const [rows, count] = await Promise.all([
      pool.query('SELECT * FROM alerts WHERE customer_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3', [req.user.customerId, q.per, q.offset]),
      pool.query('SELECT count(*) FROM alerts WHERE customer_id = $1', [req.user.customerId]),
    ]);
    const total = +count.rows[0].count;
    return res.render('alerts', { alerts: rows.rows, page: q.page, pages: Math.ceil(total / q.per), total, active: page });
  }
  if (page === 'integration') {
    const [keys, vehicles] = await Promise.all([
      pool.query('SELECT id, name, client_id, created_at, revoked_at FROM integration_keys WHERE customer_id = $1 ORDER BY id', [req.user.customerId]),
      pool.query('SELECT id, name FROM vehicles WHERE customer_id = $1 ORDER BY id', [req.user.customerId]),
    ]);
    return res.render('integration', { keys: keys.rows, vehicles: vehicles.rows, active: page });
  }
  if (page === 'billing' || page === 'invoices') {
    const q = pageQuery(req);
    let rows, count;
    if (req.user.role === 'super_admin') {
      [rows, count] = await Promise.all([
        pool.query('SELECT i.*, c.name AS customer FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.period_end DESC LIMIT $1 OFFSET $2', [q.per, q.offset]),
        pool.query('SELECT count(*) FROM invoices'),
      ]);
    } else {
      [rows, count] = await Promise.all([
        pool.query('SELECT * FROM invoices WHERE customer_id = $1 ORDER BY period_end DESC LIMIT $2 OFFSET $3', [req.user.customerId, q.per, q.offset]),
        pool.query('SELECT count(*) FROM invoices WHERE customer_id = $1', [req.user.customerId]),
      ]);
    }
    const total = +count.rows[0].count;
    return res.render(page === 'invoices' ? 'invoices' : 'billing', {
      invoices: rows.rows, page: q.page, pages: Math.ceil(total / q.per), total, active: page,
    });
  }
  res.status(404).render('error', { message: 'page not found' });
});

// ---- vehicle position history (paged) ----
router.get('/admin/vehicles/:id/positions', loadUser, rolePage('admin'), async (req, res) => {
  const v = await pool.query('SELECT id, name FROM vehicles WHERE id = $1 AND customer_id = $2', [req.params.id, req.user.customerId]);
  if (!v.rows.length) return res.status(404).render('error', { message: 'vehicle not found' });
  const q = pageQuery(req);
  const [rows, count] = await Promise.all([
    pool.query('SELECT id, recorded_at, device_time, valid, lat, lon, speed_kn, course FROM positions WHERE vehicle_id = $1 ORDER BY recorded_at DESC LIMIT $2 OFFSET $3', [v.rows[0].id, q.per, q.offset]),
    pool.query('SELECT count(*) FROM positions WHERE vehicle_id = $1', [v.rows[0].id]),
  ]);
  const total = +count.rows[0].count;
  res.render('vehicle-positions', { vehicle: v.rows[0], positions: rows.rows, page: q.page, pages: Math.ceil(total / q.per), total, active: 'vehicles' });
});

// ---- single vehicle live map ----
router.get('/admin/vehicles/:id/live', loadUser, rolePage('admin', 'super_admin'), async (req, res) => {
  let vQuery, vParams;
  if (req.user.role === 'super_admin') {
    vQuery = `SELECT v.id, v.name, v.plate, v.imei, v.dest_lat, v.dest_lon,
                     p.id AS position_id, p.recorded_at, p.device_time, p.valid, p.lat, p.lon, p.speed_kn, p.course
              FROM vehicles v
              LEFT JOIN LATERAL (SELECT * FROM positions WHERE vehicle_id = v.id ORDER BY recorded_at DESC LIMIT 1) p ON TRUE
              WHERE v.id = $1`;
    vParams = [req.params.id];
  } else {
    vQuery = `SELECT v.id, v.name, v.plate, v.imei, v.dest_lat, v.dest_lon,
                     p.id AS position_id, p.recorded_at, p.device_time, p.valid, p.lat, p.lon, p.speed_kn, p.course
              FROM vehicles v
              LEFT JOIN LATERAL (SELECT * FROM positions WHERE vehicle_id = v.id ORDER BY recorded_at DESC LIMIT 1) p ON TRUE
              WHERE v.id = $1 AND v.customer_id = $2`;
    vParams = [req.params.id, req.user.customerId];
  }
  const r = await pool.query(vQuery, vParams);
  if (!r.rows.length) return res.status(404).render('error', { message: 'vehicle not found' });
  const row = r.rows[0];
  const vehicle = {
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
  };
  res.render('vehicle-live', {
    vehicle,
    token: req.session.token,
    active: 'vehicles',
  });
});

module.exports = router;
