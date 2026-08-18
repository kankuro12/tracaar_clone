// Start the device simulator, run the browser (Playwright) test suite, then kill the simulator.
// Usage: npm run test:e2e   (server must already be running: npm start)
const { spawn, spawnSync } = require('child_process');

const sim = spawn(process.execPath, ['scripts/simulate.js', '--count=3', '--register'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, HEADING: '90', SPEED_KMH: '40', STEP_S: '5' },
});
console.log('simulator started — streaming live frames…');

let status = 1;
try {
  const r = spawnSync(process.execPath, ['--test', 'test/superadmin.test.js', 'test/erp.test.js'], { stdio: 'inherit' });
  status = r.status ?? 1;
} finally {
  sim.kill();
  console.log('simulator stopped.');
  process.exit(status);
}
