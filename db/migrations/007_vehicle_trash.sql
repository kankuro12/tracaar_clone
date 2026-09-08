-- Soft-delete ("trash") and per-vehicle dashboard visibility.
-- deleted_at set = vehicle is trashed: hidden from the active list, pickers,
-- and dashboards, but data (positions, alerts) is kept and can be restored.
-- hidden_from_dashboard is independent: vehicle stays in the active list but
-- is excluded from dashboard stats/lists only.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_from_dashboard BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles (deleted_at) WHERE deleted_at IS NOT NULL;
