-- Permanent per-vehicle daily rollup, so historical stats survive even after
-- raw position rows are pruned (see src/retention.js / POSITION_RETENTION_DAYS).
CREATE TABLE IF NOT EXISTS position_daily_summary (
  vehicle_id  BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  fixes       INT NOT NULL DEFAULT 0,
  max_kmh     DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_kmh     DOUBLE PRECISION NOT NULL DEFAULT 0,
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  first_fix   TIMESTAMPTZ,
  last_fix    TIMESTAMPTZ,
  PRIMARY KEY (vehicle_id, day)
);
CREATE INDEX IF NOT EXISTS idx_position_daily_summary_day ON position_daily_summary (day);
