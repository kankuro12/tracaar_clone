require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const superEmail = process.env.SUPER_ADMIN_EMAIL || 'super@fleet.test';
  const superPass = process.env.SUPER_ADMIN_PASSWORD || 'super123';
  const hash = await bcrypt.hash(superPass, 10);

  // default: fresh install — only the super admin, no demo tenants.
  // `--demo` additionally provisions the Demo Logistics tenant (users,
  // vehicles, geofence, plan, ERP key) used by tests and walkthroughs.
  if (!process.argv.includes('--demo')) {
    await pool.query(`TRUNCATE users, customers, vehicles, vehicle_user, positions,
                      geofences, vehicle_geofence, alerts, plans, invoices, integration_keys
                      RESTART IDENTITY CASCADE`);
    await pool.query(
      `INSERT INTO users (customer_id, role, email, password_hash, name)
       VALUES (NULL, 'super_admin', $1, $2, 'Super Admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [superEmail, hash]
    );
    console.log(`reset: all data cleared, super admin ${superEmail} / ${superPass}`);
    await pool.end();
    return;
  }

  await pool.query(
    `INSERT INTO users (customer_id, role, email, password_hash, name)
     VALUES (NULL, 'super_admin', $1, $2, 'Super Admin')
     ON CONFLICT (email) DO NOTHING`,
    [superEmail, hash]
  );

  const customer = await pool.query(
    `INSERT INTO customers (name) VALUES ('Demo Logistics')
     ON CONFLICT (name) DO NOTHING
     RETURNING id, name`
  );
  const cid = customer.rows[0]?.id
    ?? (await pool.query(`SELECT id, name FROM customers WHERE name = 'Demo Logistics'`)).rows[0].id;
  const custRow = customer.rows[0] ?? { name: 'Demo Logistics' };

  // plans may have duplicated names from pre-unique-index runs — collapse first
  await pool.query(`DELETE FROM plans a USING plans b WHERE a.name = b.name AND a.id > b.id`);
  await pool.query(
    `INSERT INTO plans (name, price_monthly, max_vehicles) VALUES
       ('Starter', 29.99, 5),
       ('Fleet', 99.99, -1)
     ON CONFLICT (name) DO NOTHING`
  );
  await pool.query(`UPDATE customers SET plan_id = (SELECT id FROM plans WHERE name = 'Fleet'), alert_email = 'ops@demo.test' WHERE id = $1`, [cid]);

  // demo geofence around the sim base point, assigned to the first vehicle
  await pool.query(
    `INSERT INTO geofences (customer_id, name, center, radius_m)
     SELECT $1, 'Depot', ST_SetSRID(ST_MakePoint(7.3636, 44.8993), 4326)::geography, 300
     WHERE NOT EXISTS (SELECT 1 FROM geofences WHERE name = 'Depot')`,
    [cid]
  );

  await pool.query(
    `INSERT INTO users (customer_id, role, email, password_hash, name)
     VALUES ($1, 'admin', 'admin@demo.test', $2, 'Demo Admin')
     ON CONFLICT (email) DO UPDATE SET customer_id = EXCLUDED.customer_id`,
    [cid, await bcrypt.hash('admin123', 10)]
  );
  await pool.query(
    `INSERT INTO users (customer_id, role, email, password_hash, name)
     VALUES ($1, 'user', 'user@demo.test', $2, 'Demo User')
     ON CONFLICT (email) DO UPDATE SET customer_id = EXCLUDED.customer_id`,
    [cid, await bcrypt.hash('user123', 10)]
  );
  await pool.query(
    `INSERT INTO users (customer_id, role, email, password_hash, name)
     VALUES ($1, 'user', 'roshan@test.com', $2, 'Roshan')
     ON CONFLICT (email) DO UPDATE SET customer_id = EXCLUDED.customer_id`,
    [cid, await bcrypt.hash('roshan123', 10)]
  );

  const vehicles = [
    ['867421030123456', 'Van 12', 'BK-4412'],
    ['867421030123457', 'Van 04', 'BK-4401'],
    ['867421030123458', 'Truck 2', 'TL-8821'],
  ];
  for (const [imei, name, plate] of vehicles) {
    await pool.query(
      `INSERT INTO vehicles (customer_id, imei, name, plate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (imei) DO UPDATE SET customer_id = EXCLUDED.customer_id`,
      [cid, imei, name, plate]
    );
  }

  const userId = await pool.query(`SELECT id FROM users WHERE email = 'user@demo.test'`);
  await pool.query(
    `INSERT INTO vehicle_user (vehicle_id, user_id)
     SELECT v.id, $1 FROM vehicles v WHERE v.customer_id = $2
     ON CONFLICT DO NOTHING`,
    [userId.rows[0].id, cid]
  );
  const roshanId = await pool.query(`SELECT id FROM users WHERE email = 'roshan@test.com'`);
  await pool.query(
    `INSERT INTO vehicle_user (vehicle_id, user_id)
     SELECT v.id, $1 FROM vehicles v WHERE v.customer_id = $2
     ON CONFLICT DO NOTHING`,
    [roshanId.rows[0].id, cid]
  );

  await pool.query(
    `INSERT INTO vehicle_geofence (geofence_id, vehicle_id)
     SELECT g.id, v.id FROM geofences g, vehicles v
     WHERE g.name = 'Depot' AND v.name = 'Van 12' AND v.customer_id = $1
     ON CONFLICT DO NOTHING`,
    [cid]
  );

  const erpKey = require('crypto').randomBytes(18).toString('hex');
  const { sha256 } = require('../src/auth');
  await pool.query(
    `INSERT INTO integration_keys (customer_id, name, key_hash, client_id)
     VALUES ($1, 'Demo ERP', $2, 'demo-erp')
     ON CONFLICT (key_hash) DO NOTHING`,
    [cid, sha256(erpKey)]
  );

  console.log(`seeded:
  super admin  ${superEmail} / ${superPass}
  admin        admin@demo.test / admin123
  user         user@demo.test / user123
  user         roshan@test.com / roshan123
  customer     ${custRow.name} with 3 vehicles (867421030123456..58)
  erp key      ${erpKey}   (POST /api/integration/session with Bearer <key>)`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
