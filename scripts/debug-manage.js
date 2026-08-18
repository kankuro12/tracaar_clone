// Debug: super admin Manage button flow.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('console', (m) => console.log('CONSOLE:', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });

  await page.goto('http://localhost:3000/login');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('textbox', { name: 'Email' }).fill('super@fleet.test');
  await page.getByRole('textbox', { name: 'Password' }).fill('super123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('http://localhost:3000/');
  await page.goto('http://localhost:3000/admin/customers');
  await page.waitForSelector('h1:has-text("Customers")');
  await page.screenshot({ path: 'shots/debug-customers.png' });
  console.log('Manage buttons:', await page.getByRole('button', { name: 'Manage' }).count());
  await page.getByRole('button', { name: 'Manage' }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/debug-after-manage.png' });
  console.log('--- main content ---');
  console.log((await page.textContent('#admin-main')).slice(0, 500));
  console.log('body has Assign IMEI:', (await page.textContent('body')).includes('Assign IMEI / register'));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
