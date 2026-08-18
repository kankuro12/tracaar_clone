/* Superadmin UI smoke test — drives the real browser against the running server
   (server-rendered pages, session-cookie auth).
   Run: npm start, then: node --test test/superadmin.test.js */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const SUF = Date.now().toString().slice(-6);
const CUST = `Acme ${SUF}`;

let browser, page;

before(async () => {
  browser = await chromium.launch({ headless: false });
  page = await browser.newPage();
  page.on('dialog', (d) => d.accept('newpass123'));
});

after(async () => { await browser.close(); });

test('super admin can sign in and reach the manage console', async () => {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', 'super@fleet.test');
  await page.fill('#password', 'super123');
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`);
  await page.click('.navbar a[href="/admin/customers"]');
  await page.waitForURL(`${BASE}/admin/customers`);
  await page.waitForSelector('h1');
  assert.match(await page.textContent('h1'), /Customers/);
});

test('create a plan', async () => {
  await page.click('.admin-nav a[href="/admin/plans"]');
  await page.waitForSelector('#create-plan');
  const name = `Pro ${SUF}`;
  await page.fill('#create-plan [name=name]', name);
  await page.fill('#create-plan [name=priceMonthly]', '19.99');
  await page.fill('#create-plan [name=maxVehicles]', '50');
  await page.click('#create-plan button[type=submit]');
  await page.waitForSelector(`td:text("${name}")`);
});

test('create a customer', async () => {
  await page.click('.admin-nav a[href="/admin/customers"]');
  await page.waitForSelector('#create-customer');
  await page.fill('#create-customer [name=name]', CUST);
  await page.fill('#create-customer [name=adminName]', `Boss ${SUF}`);
  await page.fill('#create-customer [name=adminEmail]', `boss${SUF}@acme.test`);
  await page.fill('#create-customer [name=adminPassword]', 'boss123');
  await page.click('#create-customer button[type=submit]');
  await page.waitForSelector(`tbody tr:has-text("${CUST}")`);
  const row = page.locator(`tbody tr:has-text("${CUST}")`);
  assert.equal(await row.locator('td').nth(2).textContent(), '0', 'new customer has 0 vehicles');
});

test('manage customer: register vehicle + create user', async () => {
  const row = page.locator(`tbody tr:has-text("${CUST}")`);
  await row.locator('a[href^="/admin/customers/"]').click();
  await page.waitForSelector('#reg-vehicle');
  assert.match(await page.textContent('h1'), new RegExp(CUST));

  await page.fill('#reg-vehicle [name=name]', `Truck ${SUF}`);
  await page.fill('#reg-vehicle [name=imei]', `35${SUF}0001`);
  await page.fill('#reg-vehicle [name=plate]', `ABC-${SUF}`);
  await page.click('#reg-vehicle button[type=submit]');
  await page.waitForSelector(`tbody tr:has-text("Truck ${SUF}")`);

  await page.fill('#create-tenant-user [name=name]', `Driver ${SUF}`);
  await page.fill('#create-tenant-user [name=email]', `driver${SUF}@acme.test`);
  await page.fill('#create-tenant-user [name=password]', 'driver123');
  await page.selectOption('#create-tenant-user [name=role]', 'user');
  await page.click('#create-tenant-user button[type=submit]');
  await page.waitForSelector(`tbody tr:has-text("driver${SUF}@acme.test")`);

  const userRow = page.locator(`tbody tr:has-text("driver${SUF}@acme.test")`);
  const pwRes = page.waitForResponse((r) => r.url().includes('/password') && r.status() === 204);
  await userRow.locator('[data-pw]').click();
  await pwRes;
  await page.locator(`tbody tr:has-text("driver${SUF}@acme.test") [data-del-user]`).click();
  await page.waitForFunction((email) => !document.body.textContent.includes(email), `driver${SUF}@acme.test`);
});

test('edit customer (plan + alert email) and view invoices', async () => {
  await page.click('.admin-nav a[href="/admin/customers"]');
  await page.waitForSelector(`tbody tr:has-text("${CUST}") [data-edit]`);
  const row = page.locator(`tbody tr:has-text("${CUST}")`);
  assert.equal(await row.locator('td').nth(2).textContent(), '1', 'customer now has 1 vehicle');
  await row.locator('[data-edit]').click();
  await page.waitForSelector('#edit-modal');
  await page.fill('#edit-customer [name=alertEmail]', `ops${SUF}@acme.test`);
  await page.click('#edit-customer button[type=submit]');
  await page.waitForSelector(`tbody tr:has-text("ops${SUF}@acme.test")`);

  await page.click('.admin-nav a[href="/admin/invoices"]');
  await page.waitForSelector('h1');
  assert.match(await page.textContent('h1'), /Invoices/);
  await page.waitForSelector('tbody tr');
});
