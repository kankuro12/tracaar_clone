require('dotenv').config();
const { readFileSync } = require('fs');
const { join } = require('path');
const { Client } = require('pg');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${dbName}`); // ponytail: name from our own .env, no injection risk
    console.log(`created database ${dbName}`);
  }
  await admin.end();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  console.log('schema applied');
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
