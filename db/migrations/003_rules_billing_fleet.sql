-- ============================================================
-- 003 — alert rules enforcement, driver behaviour, billing overhaul,
--       drivers and maintenance. All additive / idempotent.
-- ============================================================

-- ---- alerts: the CHECK never allowed the rule types the UI already offered,
-- ---- which is why overspeed/idle rules could be saved but never fired.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
  CHECK (type IN ('enter','exit','offline','online','overspeed','idle','maintenance'));

-- ---- driver behaviour events, derived from consecutive fixes ----
CREATE TABLE IF NOT EXISTS driving_events (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id   BIGINT,
  type        TEXT NOT NULL CHECK (type IN ('harsh_brake','harsh_accel','harsh_turn')),
  value       DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed_kmh   DOUBLE PRECISION NOT NULL DEFAULT 0,
  lat         DOUBLE PRECISION,
  lon         DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driving_events_vehicle_time
  ON driving_events (vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_driving_events_customer_time
  ON driving_events (customer_id, occurred_at DESC);

-- ---- drivers ----
CREATE TABLE IF NOT EXISTS drivers (
  id           BIGSERIAL PRIMARY KEY,
  customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  license_no   TEXT,
  phone        TEXT,
  email        TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drivers_customer ON drivers (customer_id);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS driver_id BIGINT REFERENCES drivers(id) ON DELETE SET NULL;

-- ---- maintenance reminders (by date and/or accumulated distance) ----
CREATE TABLE IF NOT EXISTS maintenance (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id    BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  due_date      DATE,
  due_km        DOUBLE PRECISION,
  notes         TEXT,
  completed_at  TIMESTAMPTZ,
  notified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_open
  ON maintenance (vehicle_id) WHERE completed_at IS NULL;

-- ============================================================
-- Billing
-- ============================================================

-- Plans gain per-vehicle pricing on top of the flat base fee. Existing plans
-- get price_per_vehicle = 0, so their invoices are unchanged.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price_per_vehicle NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_vehicles INT NOT NULL DEFAULT 0;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS billing_notes TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_no    TEXT,
  ADD COLUMN IF NOT EXISTS subtotal      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS tax_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date      DATE,
  ADD COLUMN IF NOT EXISTS currency      TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS vehicle_count INT,
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ;

-- backfill so old rows are consistent with the new columns
UPDATE invoices SET subtotal = amount WHERE subtotal IS NULL;
UPDATE invoices SET due_date = period_end + 14 WHERE due_date IS NULL;

-- widen status: partial payments, overdue and void are all real states now
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('open','partial','paid','overdue','void'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_no ON invoices (invoice_no) WHERE invoice_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices (due_date) WHERE status IN ('open','partial','overdue');

CREATE TABLE IF NOT EXISTS invoice_lines (
  id          BIGSERIAL PRIMARY KEY,
  invoice_id  BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort        INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id, sort);

CREATE TABLE IF NOT EXISTS payments (
  id          BIGSERIAL PRIMARY KEY,
  invoice_id  BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL,
  method      TEXT NOT NULL DEFAULT 'manual',
  reference   TEXT,
  note        TEXT,
  recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_time ON payments (customer_id, paid_at DESC);

-- Sequence backing human-readable invoice numbers (INV-<year>-000123).
CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1;

-- Backfill numbers for any invoice created before this migration.
UPDATE invoices
   SET invoice_no = 'INV-' || to_char(period_start, 'YYYY') || '-' || lpad(nextval('invoice_no_seq')::text, 6, '0')
 WHERE invoice_no IS NULL;
