-- Private per-user saved routes (ordered stops). Points stay plain JSONB: routes
-- are short human-made stop lists; PostGIS is unnecessary and would add cost.
CREATE TABLE IF NOT EXISTS user_routes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  points      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_routes_user_name ON user_routes (user_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_user_routes_user ON user_routes (user_id);
