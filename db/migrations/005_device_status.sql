-- H02 vehicle-status word: ignition (ACC), SOS, power cut, door, theft.
-- The raw 32-bit word is stored alongside the decoded flags so the mapping can
-- be re-derived later if a device family turns out to differ.
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS status     BIGINT,
  ADD COLUMN IF NOT EXISTS status_hex TEXT,
  ADD COLUMN IF NOT EXISTS ignition   BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_positions_vehicle_ignition
  ON positions (vehicle_id, device_time DESC) WHERE ignition IS NOT NULL;

-- Device-reported conditions become first-class alerts.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
  CHECK (type IN ('enter','exit','offline','online','overspeed','idle','maintenance',
                  'ignition_on','ignition_off','sos','power_cut','theft'));

ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_type_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_type_check
  CHECK (type IN ('overspeed','idle','offline','ignition','sos','power_cut'));
