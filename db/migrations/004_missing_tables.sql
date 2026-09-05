-- Two tables existed only in db/schema.sql (applied on fresh installs) and
-- never had a migration, so every install created before they were added to
-- schema.sql is missing them:
--
--   alert_rules — the overspeed/idle/offline thresholds the dashboard writes.
--                 Without it the alert-rules endpoints 500 and rule evaluation
--                 can never fire.
--   audit_log   — auditLog() swallows its own errors, so writes have been
--                 failing silently for as long as the table has been absent.
--
-- Both are created here so existing deployments converge with fresh ones.

CREATE TABLE IF NOT EXISTS alert_rules (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('overspeed','idle','offline')),
  threshold   INT NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (customer_id, type)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_customer_time ON audit_log (customer_id, created_at DESC);
