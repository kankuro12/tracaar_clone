-- Fleet Tracking — single schema (idempotent: safe to re-run)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS customers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   BIGINT REFERENCES customers(id) ON DELETE CASCADE, -- null only for super admin
  role          TEXT NOT NULL CHECK (role IN ('super_admin','admin','user')),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  imei        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  plate       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  dest_lat    DOUBLE PRECISION,
  dest_lon    DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles (customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_imei ON vehicles (imei); -- every ingest frame

CREATE TABLE IF NOT EXISTS vehicle_user (
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (vehicle_id, user_id)
);

CREATE TABLE IF NOT EXISTS positions (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_time TIMESTAMPTZ NOT NULL,
  valid       BOOLEAN NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  point       geography(Point,4326) GENERATED ALWAYS AS
                (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED,
  speed_kn    DOUBLE PRECISION NOT NULL DEFAULT 0,
  course      DOUBLE PRECISION NOT NULL DEFAULT 0,
  raw_frame   TEXT NOT NULL
);
-- latest-position lookup: DISTINCT ON (vehicle_id) ORDER BY device_time DESC
CREATE INDEX IF NOT EXISTS idx_positions_vehicle_devicetime
  ON positions (vehicle_id, device_time DESC);

-- ---- geofences / alerts ----
CREATE TABLE IF NOT EXISTS geofences (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  center      geography(Point,4326) NOT NULL,
  radius_m    DOUBLE PRECISION NOT NULL CHECK (radius_m > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geofences_customer ON geofences (customer_id);

CREATE TABLE IF NOT EXISTS vehicle_geofence (
  geofence_id BIGINT NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  PRIMARY KEY (geofence_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  geofence_id BIGINT REFERENCES geofences(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('enter','exit','offline','online')),
  message     TEXT NOT NULL,
  lat         DOUBLE PRECISION,
  lon         DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alerts_customer_time ON alerts (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_open ON alerts (vehicle_id, type) WHERE resolved_at IS NULL;

-- ---- billing ----
CREATE TABLE IF NOT EXISTS plans (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_vehicles  INT NOT NULL DEFAULT -1, -- -1 = unlimited
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_name ON plans (name);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS plan_id BIGINT REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS alert_email TEXT,
  ADD COLUMN IF NOT EXISTS alert_webhook TEXT;

CREATE TABLE IF NOT EXISTS invoices (
  id           BIGSERIAL PRIMARY KEY,
  customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid')),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id, period_end DESC);

-- ---- ERP integration keys ----
-- Keys are bound to a customer + client_id (the ERP's own erp_client_id).
-- Only the key hash is stored; the raw key is shown exactly once at creation.
-- Re-registering the same client_id rotates the key (UPDATE), never duplicates.
CREATE TABLE IF NOT EXISTS integration_keys (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);
-- migrate older installs lacking the client binding columns
ALTER TABLE integration_keys
  ADD COLUMN IF NOT EXISTS client_id TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_keys_client ON integration_keys (client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_keys_username ON integration_keys (username) WHERE username IS NOT NULL;

-- ---- Blocked IMEI forensics (unknown devices still sending) ----
CREATE TABLE IF NOT EXISTS blocked_imei_hits (
  imei       TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits       BIGINT NOT NULL DEFAULT 1,
  last_ip    TEXT,
  last_raw   TEXT,
  last_lat   DOUBLE PRECISION,
  last_lon   DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_blocked_imei_last_seen ON blocked_imei_hits (last_seen DESC);
