require('dotenv').config();
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      ran++;
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${e.message}`);
    }
  }
  console.log(ran ? `${ran} migration(s) applied` : 'up to date');
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
