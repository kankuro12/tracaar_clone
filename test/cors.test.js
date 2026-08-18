/* CORS test — API called from a foreign origin (like an ERP server), plus the
   roshan@test.com login. Run: npm start, then: node --test test/cors.test.js */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { chromium } = require('playwright');

const API = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3456';

let browser, page, originServer;

before(async () => {
  originServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><body id="out"></body>`);
  });
  await new Promise((r) => originServer.listen(3456, r));
  browser = await chromium.launch({ headless: false });
  page = await browser.newPage();
  await page.goto(ORIGIN);
});

after(async () => {
  await browser.close();
  originServer.close();
});

test('foreign origin: preflight + roshan login + authorized GET', async () => {
  const preflight = await page.evaluate(async ({ API }) => {
    const r = await fetch(`${API}/api/login`, { method: 'OPTIONS', headers: { Origin: location.origin } });
    return { status: r.status, acao: r.headers.get('access-control-allow-origin'), acm: r.headers.get('access-control-allow-methods') };
  }, { API });
  assert.equal(preflight.status, 204, 'OPTIONS preflight answered');
  assert.equal(preflight.acao, '*');
  assert.match(preflight.acm, /POST/);

  const out = await page.evaluate(async ({ API }) => {
    const r = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'roshan@test.com', password: 'roshan123' }),
    });
    const body = await r.json();
    if (!r.ok) return { status: r.status, err: body.error };
    const v = await fetch(`${API}/api/vehicles`, { headers: { Authorization: `Bearer ${body.token}` } });
    return { status: r.status, role: body.user.role, vehicles: (await v.json()).length };
  }, { API });
  assert.equal(out.status, 200, 'cross-origin login works');
  assert.equal(out.role, 'user');
  assert.ok(out.vehicles >= 1, `roshan sees vehicles (got ${out.vehicles})`);
});
