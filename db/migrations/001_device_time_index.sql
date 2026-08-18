-- latest-position lookup now orders by device_time (fix time per the device),
-- not recorded_at (server arrival time) — swap the supporting index.
DROP INDEX IF EXISTS idx_positions_vehicle_time;
CREATE INDEX IF NOT EXISTS idx_positions_vehicle_devicetime
  ON positions (vehicle_id, device_time DESC);
