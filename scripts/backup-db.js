// Dumps the database to db/backups/<name>-<timestamp>.dump using pg_dump's
// custom format (compressed, restorable with pg_restore). Requires the
// postgresql-client tools (pg_dump) to be on PATH — same major version as the
// server is safest.
//
// Usage: node scripts/backup-db.js [--keep N]
// Cron/Task Scheduler this daily; --keep prunes older backups (default 14).

require('dotenv').config();
const { spawnSync } = require('child_process');
const { mkdirSync, readdirSync, statSync, unlinkSync } = require('fs');
const { join } = require('path');

const BACKUP_DIR = join(__dirname, '..', 'db', 'backups');

function parseArgs(argv) {
  const out = { keep: 14 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keep') out.keep = +argv[++i] || out.keep;
  }
  return out;
}

function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  mkdirSync(BACKUP_DIR, { recursive: true });

  const { keep } = parseArgs(process.argv.slice(2));
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1) || 'db';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(BACKUP_DIR, `${dbName}-${stamp}.dump`);

  const result = spawnSync('pg_dump', ['--format=custom', '--file', file, process.env.DATABASE_URL], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pg_dump exited with code ${result.status}`);
  console.log(`backup written: ${file}`);

  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(`${dbName}-`) && f.endsWith('.dump'))
    .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) {
    unlinkSync(join(BACKUP_DIR, f));
    console.log(`pruned old backup: ${f}`);
  }
}

main();
