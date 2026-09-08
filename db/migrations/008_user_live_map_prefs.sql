-- Server-side, per-user map-control preferences (follow/trail/geofences) for
-- the single-vehicle live tracking page, so they survive across browsers/devices.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS live_map_prefs JSONB;
