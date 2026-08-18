(async () => {
  const login = await fetch('http://localhost:3000/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.test', password: 'admin123' }) });
  const { token } = await login.json();
  const from = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const r = await fetch(`http://localhost:3000/api/vehicles/1/positions?from=${encodeURIComponent(from)}`, { headers: { authorization: `Bearer ${token}` } });
  const rows = await r.json();
  console.log('status', r.status, 'rows', rows.length, 'valid', rows.filter(p => p.valid).length);
  console.log('sample', JSON.stringify(rows[0]).slice(0, 200));
  process.exit(0);
})();
