-- Vehicle class drives the map marker glyph (and later, per-class speed rules).
-- Defaults to 'car' so existing fleets keep a sensible icon without a backfill.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'car';

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_type_check;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_type_check
  CHECK (type IN ('bike','car','bus','truck','three_wheeler'));
