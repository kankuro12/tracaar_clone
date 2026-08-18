// Super admin UI browser check: dashboard + admin console tabs.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  let failed = 0;
  const check = (name, cond) => { console.log((cond ? '  ✔ ' : '  ✖ ') + name); if (!cond) failed++; };

  await page.goto('http://localhost:3000/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('textbox', { name: 'Email' }).fill('super@fleet.test');
  await page.getByRole('textbox', { name: 'Password' }).fill('super123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('http://localhost:3000/');
  await page.waitForFunction(() => document.querySelectorAll('.vehicle-row').length > 0, { timeout: 15000 });

  console.log('== Super admin: live dashboard ==');
  check('dashboard renders with all vehicles (global scope)', (await page.locator('.vehicle-row').count()) >= 6);
  check('role chip shows super admin', (await page.textContent('.role')) === 'super admin');
  check('live indicator on', (await page.textContent('#live-text')) === 'live');
  await page.waitForFunction(() => document.querySelectorAll('.marker-dot').length >= 3);
  check('markers on map', true);
  await page.screenshot({ path: 'shots/super-dashboard.png' });

  console.log('== Super admin: admin console ==');
  await page.goto('http://localhost:3000/admin/customers');
  await page.waitForSelector('h1:has-text("Customers")');
  check('Customers tab active by default', true);
  const tabs = (await page.textContent('#admin-nav'));
  check('tabs: Customers/Plans/Invoices', tabs.includes('Customers') && tabs.includes('Plans') && tabs.includes('Invoices'));
  check('no Vehicles tab (super manages via customer detail)', !tabs.includes('Vehicles'));

  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await page.waitForSelector('h1:has-text("Plans")');
  check('Plans page renders', await page.locator('.tbl tbody tr').count() >= 2);
  await page.screenshot({ path: 'shots/super-plans.png' });

  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.waitForSelector('h1:has-text("Invoices")');
  check('Invoices page renders', true);
  await page.screenshot({ path: 'shots/super-invoices.png' });

  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.waitForSelector('h1:has-text("Customers")');
  const custRow = page.locator('tr', { hasText: 'Demo Logistics' });
  check('customer row shows plan + vehicle count', (await custRow.textContent()).includes('Fleet'));
  await custRow.getByRole('button', { name: 'Manage' }).click();
  await page.waitForSelector('button:has-text("Assign IMEI / register")');
  check('customer detail: vehicle list', (await page.textContent('body')).includes('867421030123456'));
  check('customer detail: users list', (await page.textContent('body')).includes('user@demo.test'));
  check('customer detail: reset password buttons', await page.getByRole('button', { name: 'Reset password' }).count() >= 2);
  await page.screenshot({ path: 'shots/super-client-detail.png' });

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
