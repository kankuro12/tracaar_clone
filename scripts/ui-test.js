// Playwright UI smoke test: dashboard live map + super admin client management.
// Run: node scripts/ui-test.js   (server must be running on :3000)
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };
const bad = (name, e) => { failed++; console.log(`  ✖ ${name}: ${e.message}`); };

async function expect(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e); }
}

const relogin = async (ctx, page, email, password) => {
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  console.log('== Dashboard (admin) ==');
  await expect('login page renders', async () => {
    await page.goto(`${BASE}/login`);
    await page.getByRole('button', { name: 'Sign in' }).waitFor();
  });
  await expect('login as admin works', async () => {
    await relogin(ctx, page, 'admin@demo.test', 'admin123');
    await page.getByRole('heading', { name: 'Vehicles' }).waitFor();
  });
  await expect('sidebar shows vehicles with live data (no NaN)', async () => {
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('.vehicle-row')];
      return rows.length >= 3 && rows.every((r) => !r.textContent.includes('NaN'));
    }, { timeout: 15000 });
  });
  await expect('WS live indicator shows live', async () => {
    await page.waitForFunction(() => document.getElementById('live-text').textContent === 'live');
  });
  await expect('markers rendered on map', async () => {
    await page.waitForFunction(() => document.querySelectorAll('.marker-dot').length >= 3);
  });
  await expect('single-select draws trail + fits view', async () => {
    const row = page.locator('.vehicle-row', { hasText: 'Van 12' }).first();
    await row.click();
    await page.waitForFunction(() => document.querySelectorAll('.trail').length === 1, { timeout: 15000 });
    const selected = await page.locator('.vehicle-row.selected').count();
    if (selected !== 1) throw new Error(`expected 1 selected row, got ${selected}`);
    await page.screenshot({ path: 'shots/dashboard-trail.png' });
  });
  await expect('multi-select removes trail', async () => {
    await page.locator('.vehicle-row', { hasText: 'Van 04' }).click();
    await page.waitForTimeout(800);
    const trail = await page.locator('.trail').count();
    if (trail !== 0) throw new Error('trail should be gone in multi-select');
  });
  await expect('geofence circle drawn (admin)', async () => {
    const circles = await page.locator('.geofence').count();
    if (circles < 1) throw new Error('no geofence circles');
  });
  await expect('no console errors on dashboard', async () => {
    if (consoleErrors.length) throw new Error(consoleErrors.join(' | '));
  });

  console.log('== Super admin: client management ==');
  await expect('login as super admin', async () => relogin(ctx, page, 'super@fleet.test', 'super123'));
  await expect('admin console accessible', async () => {
    await page.goto(`${BASE}/admin/customers`);
    await page.getByRole('heading', { name: 'Customers' }).waitFor();
    await page.locator('a[href="/admin/plans"]').waitFor();
  });
  let acmeStamp = null;
  await expect('create new client', async () => {
    acmeStamp = Date.now();
    await page.fill('#create-customer input[name="name"]', `Acme Corp ${acmeStamp}`);
    await page.fill('#create-customer input[name="adminName"]', 'Acme Admin');
    await page.fill('#create-customer input[name="adminEmail"]', `acme${acmeStamp}@test.io`);
    await page.fill('#create-customer input[name="adminPassword"]', 'acme1234');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await page.waitForFunction((s) => document.body.textContent.includes(`Acme Corp ${s}`), acmeStamp);
    await page.screenshot({ path: 'shots/super-customers.png' });
  });
  await expect('manage: register vehicle by IMEI for client', async () => {
    await page.locator('tr', { hasText: `Acme Corp ${acmeStamp}` }).locator('a[href^="/admin/customers/"]').click();
    await page.getByRole('button', { name: 'Assign IMEI / register' }).waitFor();
    await page.fill('#reg-vehicle input[name="name"]', 'Acme Truck 1');
    await page.fill('#reg-vehicle input[name="imei"]', `8674210${String(Date.now()).slice(-8)}`);
    await page.fill('#reg-vehicle input[name="plate"]', 'AC-123');
    await page.getByRole('button', { name: 'Assign IMEI / register' }).click();
    await page.waitForFunction(() => document.body.textContent.includes('867421039999001'));
    await page.screenshot({ path: 'shots/super-client-detail.png' });
  });
  await expect('create user for client', async () => {
    await page.fill('#create-tenant-user input[name="name"]', 'Acme Driver');
    await page.fill('#create-tenant-user input[name="email"]', `driver${acmeStamp}@acme.io`);
    await page.fill('#create-tenant-user input[name="password"]', 'driver123');
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await page.waitForFunction((s) => document.body.textContent.includes(`driver${s}@acme.io`), acmeStamp);
  });
  await expect('reset user password', async () => {
    page.once('dialog', (d) => d.accept('newpass123'));
    await page.locator('tr', { hasText: `driver${acmeStamp}@acme.io` }).getByRole('button', { name: 'Reset password' }).click();
    await page.waitForTimeout(1000);
  });
  await expect('new client admin can log in', async () => {
    await relogin(ctx, page, `acme${acmeStamp}@test.io`, 'acme1234');
    await page.waitForFunction(() => document.body.textContent.includes('Acme Truck 1'), { timeout: 10000 });
  });
  await expect('tenant isolation: acme admin cannot see demo vehicles', async () => {
    const rows = await page.locator('.vehicle-row').count();
    if (rows !== 1) throw new Error(`expected 1 vehicle, got ${rows}`);
  });
  await expect('reset password works for user login', async () => {
    await relogin(ctx, page, `driver${acmeStamp}@acme.io`, 'newpass123');
    await page.waitForFunction(() => document.body.textContent.includes('No vehicles assigned'), { timeout: 10000 });
  });

  console.log('== Tenant user scoping ==');
  await expect('demo user sees only assigned vehicles', async () => {
    await relogin(ctx, page, 'user@demo.test', 'user123');
    await page.waitForFunction(() => document.querySelectorAll('.vehicle-row').length === 3, { timeout: 10000 });
    await page.screenshot({ path: 'shots/user-dashboard.png' });
  });

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log(`console errors seen: ${consoleErrors.join(' | ')}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
